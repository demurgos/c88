import { mergeProcessCovs, ProcessCov } from "@c88/v8-coverage";
import { RichProcessCov, ScriptMeta } from "./spawn-inspected";

export function mergeRichProcessCovs(processCovs: ReadonlyArray<RichProcessCov>): RichProcessCov {
  const urlToMeta: Map<string, ScriptMeta> = createScriptMetaMap(processCovs);
  const merged: ProcessCov = mergeProcessCovs(processCovs);

  for (const scriptCov of merged.result) {
    const meta: ScriptMeta = urlToMeta.get(scriptCov.url)!;
    Object.assign(scriptCov, meta);
  }

  return merged as RichProcessCov;
}

export function createScriptMetaMap(processCovs: ReadonlyArray<RichProcessCov>): Map<string, ScriptMeta> {
  const urlToScriptData: Map<string, ScriptMeta> = new Map();
  for (const processCov of processCovs) {
    for (const scriptCov of processCov.result) {
      urlToScriptData.set(scriptCov.url, scriptCov);
    }
  }
  return urlToScriptData;
}
