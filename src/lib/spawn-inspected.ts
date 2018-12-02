import { ProcessCov, ScriptCov } from "@c88/v8-coverage";
import assert from "assert";
import cp from "child_process";
import cri from "chrome-remote-interface";
import { ChildProcessProxy, observeSpawn, ObserveSpawnOptions, SpawnEvent } from "demurgos-spawn-wrap";
import Protocol from "devtools-protocol";
import events from "events";
import { SourceType } from "istanbulize";
import { CoverageFilter } from "./filter";

const DEBUGGER_URI_RE: RegExp = /ws:\/\/.*?:(\d+)\//;
// In milliseconds (10s)
const GET_DEBUGGER_PORT_TIMEOUT: number = 10000;

export interface ScriptMeta {
  sourceText: string;
  sourceType: SourceType;
  sourceMapUrl?: string;
}

export interface RichScriptCov extends ScriptCov, ScriptMeta {
}

export interface RichProcessCov extends ProcessCov {
  result: RichScriptCov[];
}

export interface SpawnInspectedOptions extends ObserveSpawnOptions {
  filter?: CoverageFilter;

  timeout?: number;

  onRootProcess?(process: cp.ChildProcess): any;
}

export async function spawnInspected(
  file: string,
  args: ReadonlyArray<string>,
  options: SpawnInspectedOptions,
): Promise<RichProcessCov[]> {
  const processCovs: RichProcessCov[] = [];

  return new Promise<RichProcessCov[]>((resolve, reject) => {
    observeSpawn(file, args, options)
      .subscribe(
        async (ev: SpawnEvent) => {
          try {
            if (ev.rootProcess !== undefined && options.onRootProcess !== undefined) {
              options.onRootProcess(ev.rootProcess);
            }
            const args: ReadonlyArray<string> = ["--inspect=0", ...ev.args];
            const proxy: ChildProcessProxy = ev.proxySpawn(args);
            const debuggerPort: number = await getDebuggerPort(proxy);
            const processCov: RichProcessCov = await getCoverage(debuggerPort, options.filter, options.timeout);
            processCovs.push(processCov);
          } catch (err) {
            reject(err);
          }
        },
        reject,
        () => resolve(processCovs),
      );
  });
}

export async function getDebuggerPort(proc: ChildProcessProxy): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const timeoutId: NodeJS.Timer = setTimeout(onTimeout, GET_DEBUGGER_PORT_TIMEOUT * 100);
    let stderrBuffer: Buffer = Buffer.alloc(0);
    proc.stderr.on("data", onStderrData);
    proc.stderr.on("close", onClose);

    function onStderrData(chunk: Buffer): void {
      stderrBuffer = Buffer.concat([stderrBuffer, chunk]);
      const stderrStr: string = stderrBuffer.toString("UTF-8");
      const match: RegExpExecArray | null = DEBUGGER_URI_RE.exec(stderrStr);
      if (match === null) {
        return;
      }
      const result: number = parseInt(match[1], 10);
      removeListeners();
      resolve(result);
    }

    function onClose(code: number | null, signal: string | null): void {
      removeListeners();
      reject(new Error(`Unable to hook inspector (early exit, ${code}, ${signal})`));
    }

    function onTimeout(): void {
      removeListeners();
      reject(new Error("Unable to hook inspector (timeout)"));
      // proc.kill();
    }

    function removeListeners(): void {
      proc.stderr.removeListener("data", onStderrData);
      proc.stderr.removeListener("close", onClose);
      clearTimeout(timeoutId);
    }
  });
}

async function getCoverage(port: number, filter?: CoverageFilter, timeout?: number): Promise<RichProcessCov> {
  return new Promise<RichProcessCov>(async (resolve, reject) => {
    const timeoutId: NodeJS.Timer | undefined = timeout !== undefined ? setTimeout(onTimeout, timeout) : undefined;
    let client: any;
    let mainExecutionContextId: Protocol.Runtime.ExecutionContextId | undefined;
    const scriptIdToMeta: Map<Protocol.Runtime.ScriptId, Partial<ScriptMeta>> = new Map();
    let state: string = "WaitingForMainContext"; // TODO: enum
    try {
      client = await cri({port});

      await client.Profiler.enable();
      await client.Profiler.startPreciseCoverage({callCount: true, detailed: true});
      await client.Debugger.enable();

      (client as any as events.EventEmitter).once("Runtime.executionContextCreated", onMainContextCreation);
      (client as any as events.EventEmitter).on("Runtime.executionContextDestroyed", onContextDestruction);
      (client as any as events.EventEmitter).on("Debugger.scriptParsed", onScriptParsed);

      await client.Runtime.enable();
    } catch (err) {
      removeListeners();
      reject(err);
    }

    function onMainContextCreation(ev: Protocol.Runtime.ExecutionContextCreatedEvent) {
      assert(state === "WaitingForMainContext");
      mainExecutionContextId = ev.context.id;
      state = "WaitingForMainContextDestruction";
    }

    function onScriptParsed(ev: Protocol.Debugger.ScriptParsedEvent) {
      const collect: boolean = filter !== undefined ? filter(ev) : true;
      if (collect) {
        let sourceType: SourceType = SourceType.Script;
        if (ev.isModule !== undefined) {
          sourceType = ev.isModule ? SourceType.Module : SourceType.Script;
        }
        let sourceMapUrl: string | undefined;
        if (ev.sourceMapURL !== undefined && ev.sourceMapURL !== "") {
          sourceMapUrl = ev.sourceMapURL;
        }
        scriptIdToMeta.set(
          ev.scriptId,
          {
            sourceType,
            sourceMapUrl,
          },
        );
      }
    }

    async function onContextDestruction(ev: Protocol.Runtime.ExecutionContextDestroyedEvent): Promise<void> {
      assert(state === "WaitingForMainContextDestruction");
      if (ev.executionContextId !== mainExecutionContextId) {
        return;
      }
      state = "WaitingForCoverage";

      try {
        // await client.Profiler.stopPreciseCoverage();
        await client.HeapProfiler.collectGarbage();
        const {result: scriptCovs} = await client.Profiler.takePreciseCoverage();
        const result: RichScriptCov[] = [];
        for (const scriptCov of scriptCovs) {
          const meta: Partial<ScriptMeta> | undefined = scriptIdToMeta.get(scriptCov.scriptId);
          if (meta === undefined) {
            // `undefined` means that the script was filtered out.
            continue;
          }
          const {scriptSource} = await client.Debugger.getScriptSource({scriptId: scriptCov.scriptId});
          result.push({
            ...scriptCov,
            sourceText: scriptSource,
            ...meta,
          } as RichScriptCov);
        }
        resolve({result});
      } catch (err) {
        reject(err);
      } finally {
        removeListeners();
      }
    }

    function onTimeout(): void {
      removeListeners();
      reject(new Error("Unable to get V8 coverage (timeout)"));
    }

    function removeListeners(): void {
      (client as any as events.EventEmitter).removeListener("Runtime.executionContextCreated", onMainContextCreation);
      (client as any as events.EventEmitter).removeListener("Runtime.executionContextDestroyed", onContextDestruction);
      (client as any as events.EventEmitter).removeListener("Runtime.scriptParsed", onScriptParsed);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      (client as any).close();
    }
  });
}
