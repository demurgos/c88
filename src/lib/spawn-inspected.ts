import { ProcessCov, ScriptCov } from "@c88/v8-coverage";
import assert from "assert";
import cp from "child_process";
import cri from "chrome-remote-interface";
import Protocol from "devtools-protocol";
import events from "events";
import { SourceType } from "istanbulize";
import { InspectorClient, InspectorServer } from "node-inspector-server";
import { CoverageFilter } from "./filter";

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

export interface SpawnInspectedOptions extends cp.SpawnOptions {
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

  const srv: InspectorServer = await InspectorServer.open();

  return new Promise<RichProcessCov[]>((resolve, reject) => {
    srv
      .subscribe(
        async (ev: InspectorClient) => {
          try {
            // if (ev.rootProcess !== undefined && options.onRootProcess !== undefined) {
            //   options.onRootProcess(ev.rootProcess);
            // }
            // const args: ReadonlyArray<string> = ["--inspect=0", ...ev.args];
            // const proxy: ChildProcessProxy = ev.proxySpawn(args);
            // const debuggerPort: number = await getDebuggerPort(proxy);
            const processCov: RichProcessCov = await getCoverage(ev.url, options.filter, options.timeout);
            processCovs.push(processCov);
          } catch (err) {
            reject(err);
          }
        },
        reject,
        () => resolve(processCovs),
      );

    const child: cp.ChildProcess = srv.spawn(file, args, options);
    if (options.onRootProcess !== undefined) {
      options.onRootProcess(child);
    }

    child.on("close", () => {
      srv.closeSync();
    });
  });
}

async function getCoverage(url: string, filter?: CoverageFilter, timeout?: number): Promise<RichProcessCov> {
  return new Promise<RichProcessCov>(async (resolve, reject) => {
    const timeoutId: NodeJS.Timer | undefined = timeout !== undefined ? setTimeout(onTimeout, timeout) : undefined;
    let session: any;
    let mainExecutionContextId: Protocol.Runtime.ExecutionContextId | undefined;
    const scriptIdToMeta: Map<Protocol.Runtime.ScriptId, Partial<ScriptMeta>> = new Map();
    let state: string = "WaitingForMainContext"; // TODO: enum
    try {
      session = await cri({target: url});
      (session as any as events.EventEmitter).once("Runtime.executionContextCreated", onMainContextCreation);
      (session as any as events.EventEmitter).on("Runtime.executionContextDestroyed", onContextDestruction);
      (session as any as events.EventEmitter).on("Debugger.scriptParsed", onScriptParsed);

      await session.Profiler.enable();
      await session.Profiler.startPreciseCoverage({callCount: true, detailed: true});
      await session.Debugger.enable();
      await session.Runtime.enable();
      await session.Runtime.runIfWaitingForDebugger();
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
        // await session.Profiler.stopPreciseCoverage();
        await session.HeapProfiler.collectGarbage();
        const {result: scriptCovs} = await session.Profiler.takePreciseCoverage();
        const result: RichScriptCov[] = [];
        for (const scriptCov of scriptCovs) {
          const meta: Partial<ScriptMeta> | undefined = scriptIdToMeta.get(scriptCov.scriptId);
          if (meta === undefined) {
            // `undefined` means that the script was filtered out.
            continue;
          }
          const {scriptSource} = await session.Debugger.getScriptSource({scriptId: scriptCov.scriptId});
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
      if (session === undefined) {
        // Failure before the session is created
        return;
      }

      (session as any as events.EventEmitter).removeListener("Runtime.executionContextCreated", onMainContextCreation);
      (session as any as events.EventEmitter).removeListener("Runtime.executionContextDestroyed", onContextDestruction);
      (session as any as events.EventEmitter).removeListener("Runtime.scriptParsed", onScriptParsed);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      (session as any).close();
    }
  });
}
