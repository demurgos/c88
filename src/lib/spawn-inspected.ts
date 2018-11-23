import { ProcessCov, ScriptCov } from "@c88/v8-coverage";
import assert from "assert";
import cri from "chrome-remote-interface";
import { ChildProcessProxy, observeSpawn, ObserveSpawnOptions, SpawnEvent } from "demurgos-spawn-wrap";
import Protocol from "devtools-protocol";
import events from "events";
import { SourceType } from "istanbulize";
import { CoverageFilter } from "./filter";

const DEBUGGER_URI_RE = /ws:\/\/.*?:(\d+)\//;
// In milliseconds (1s)
const GET_DEBUGGER_PORT_TIMEOUT = 1000;
// In milliseconds (10s)
const GET_COVERAGE_TIMEOUT = 10000;

export interface SourcedScriptCov extends ScriptCov {
  sourceText: string;
  sourceType: SourceType;
}

export interface SourcedProcessCov extends ProcessCov {
  result: SourcedScriptCov[];
}

export interface SpawnInspectedOptions extends ObserveSpawnOptions {
  filter?: CoverageFilter,
}

export async function spawnInspected(
  file: string,
  args: ReadonlyArray<string>,
  options: SpawnInspectedOptions,
): Promise<SourcedProcessCov[]> {
  const processCovs: SourcedProcessCov[] = [];

  return new Promise<SourcedProcessCov[]>((resolve, reject) => {
    observeSpawn(file, args, options)
      .subscribe(
        async (ev: SpawnEvent) => {
          const proxy = ev.proxySpawn(["--inspect=0", ...ev.args]);
          const debuggerPort: number = await getDebuggerPort(proxy);
          const processCov: SourcedProcessCov = await getCoverage(debuggerPort, options.filter);
          processCovs.push(processCov);
        },
        (error: Error) => reject(error),
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
      const stderrStr = stderrBuffer.toString("UTF-8");
      const match = DEBUGGER_URI_RE.exec(stderrStr);
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
      reject(new Error(`Unable to hook inspector (timeout)`));
      // proc.kill();
    }

    function removeListeners(): void {
      proc.stderr.removeListener("data", onStderrData);
      proc.stderr.removeListener("close", onClose);
      clearTimeout(timeoutId);
    }
  });
}

async function getCoverage(port: number, filter?: CoverageFilter): Promise<SourcedProcessCov> {
  return new Promise<SourcedProcessCov>(async (resolve, reject) => {
    const timeoutId: NodeJS.Timer = setTimeout(onTimeout, GET_COVERAGE_TIMEOUT);
    let client: any;
    let mainExecutionContextId: Protocol.Runtime.ExecutionContextId | undefined;
    const scriptsToCollect: Map<Protocol.Runtime.ScriptId, boolean> = new Map();
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
        scriptsToCollect.set(ev.scriptId, ev.isModule !== undefined ? ev.isModule : false);
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
        const result: SourcedScriptCov[] = [];
        for (const scriptCov of scriptCovs) {
          const isModule: boolean | undefined = scriptsToCollect.get(scriptCov.scriptId);
          if (isModule === undefined) {
            continue;
          }
          const {scriptSource} = await client.Debugger.getScriptSource({scriptId: scriptCov.scriptId});
          result.push({
            ...scriptCov,
            sourceText: scriptSource,
            sourceType: isModule ? SourceType.Module : SourceType.Script,
          });
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
      reject(new Error(`Unable to get V8 coverage (timeout)`));
    }

    function removeListeners(): void {
      (client as any as events.EventEmitter).removeListener("Runtime.executionContextCreated", onMainContextCreation);
      (client as any as events.EventEmitter).removeListener("Runtime.executionContextDestroyed", onContextDestruction);
      (client as any as events.EventEmitter).removeListener("Runtime.scriptParsed", onScriptParsed);
      clearTimeout(timeoutId);
      (client as any).close();
    }
  });
}
