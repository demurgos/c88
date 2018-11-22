import { mergeProcessCovs, ProcessCov } from "@c88/v8-coverage";
import libCoverage from "istanbul-lib-coverage";
import { IstanbulFileCoverageData, istanbulize, SourceType, unwrapScriptCov, unwrapSourceText } from "istanbulize";
import { Reporter, StreamReporter, VinylReporter } from "./reporter";
import { ReporterRegistry } from "./reporter-registry";
import { CompoundReporter } from "./reporters/compound";
import { SourcedProcessCov } from "./spawn-instrumented";

export interface ReportOptions<R extends Reporter = Reporter> {
  processCovs: ReadonlyArray<SourcedProcessCov>;
  reporter: R;
  outDir?: string;
}

interface ScriptData {
  sourceText: string;
  sourceType: SourceType;
}

export function createReporter(registry: ReporterRegistry, ids: ReadonlyArray<string>, options: any): Reporter {
  const reporters: Reporter[] = [];
  for (const id of ids) {
    reporters.push(registry.create(id, options));
  }
  return reporters.length === 1 ? reporters[0] : new CompoundReporter(reporters);
}

export function reportVinyl(
  reporter: VinylReporter,
  processCovs: ReadonlyArray<SourcedProcessCov>,
): NodeJS.ReadableStream {
  const map: libCoverage.CoverageMap = toIstanbulCoverageMap(processCovs);
  const sourceFinder: (filepath: string) => string = createSourceFinder(processCovs);
  return reporter.reportVinyl({map, sourceFinder});
}

export function reportStream(
  reporter: StreamReporter,
  processCovs: ReadonlyArray<SourcedProcessCov>,
): NodeJS.ReadableStream {
  const map: libCoverage.CoverageMap = toIstanbulCoverageMap(processCovs);
  const sourceFinder: (filepath: string) => string = createSourceFinder(processCovs);
  return reporter.reportStream({map, sourceFinder});
}

export function createScriptDataMap(processCovs: ReadonlyArray<SourcedProcessCov>): Map<string, ScriptData> {
  const urlToScriptData: Map<string, ScriptData> = new Map();
  for (const processCov of processCovs) {
    for (const {url, sourceText, sourceType} of processCov.result) {
      urlToScriptData.set(
        url,
        {
          sourceText,
          sourceType,
        },
      );
    }
  }
  return urlToScriptData;
}

function toIstanbulCoverageMap(processCovs: ReadonlyArray<SourcedProcessCov>): libCoverage.CoverageMap {
  const urlToScriptData: Map<string, ScriptData> = createScriptDataMap(processCovs);
  const merged: ProcessCov = mergeProcessCovs(processCovs);

  const map: libCoverage.CoverageMap = libCoverage.createCoverageMap({});
  for (const scriptCov of merged.result) {
    const {sourceType, sourceText} = urlToScriptData.get(scriptCov.url)!;
    const istanbulCoverage: IstanbulFileCoverageData = istanbulize({
      sourceType,
      sourceText: sourceType === SourceType.Script ? unwrapSourceText(sourceText) : sourceText,
      scriptCov: sourceType === SourceType.Script ? unwrapScriptCov(scriptCov) : scriptCov,
    });
    map.merge({[istanbulCoverage.path]: istanbulCoverage as libCoverage.FileCoverage});
  }

  return map;
}

function createSourceFinder(processCovs: ReadonlyArray<SourcedProcessCov>): (filepath: string) => string {
  const urlToScriptData: Map<string, ScriptData> = createScriptDataMap(processCovs);
  return function findSource(filepath: string): string {
    const scriptData: ScriptData | undefined = urlToScriptData.get(filepath);
    if (scriptData === undefined) {
      throw new Error(`FileNotFound: ${filepath}`);
    } else {
      return scriptData.sourceType === SourceType.Script
        ? unwrapSourceText(scriptData.sourceText)
        : scriptData.sourceText;
    }
  };
}
