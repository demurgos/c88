import { mergeProcessCovs, ProcessCov } from "@c88/v8-coverage";
import asyncDone from "async-done";
import libCoverage, { FileCoverage } from "istanbul-lib-coverage";
import reports from "istanbul-reports";
import { IstanbulFileCoverageData, istanbulize, SourceType, unwrapScriptCov, unwrapSourceText } from "istanbulize";
import merge2 from "merge2";
import vinylFs from "vinyl-fs";
import { SourcedProcessCov } from "./spawn-instrumented";
import { vinylReport } from "./vinyl-istanbul";

export type IstanbulReporter = "text" | "lcovonly" | "html";

export interface ReportOptions {
  processCovs: SourcedProcessCov[];
  reporters: IstanbulReporter[];
  coverageDir: string;
  watermarks: any;
}

interface ScriptData {
  sourceText: string;
  sourceType: SourceType;
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
      return scriptData.sourceType === SourceType.Script ? unwrapSourceText(scriptData.sourceText) : scriptData.sourceText;
    }
  };
}

export function report(options: ReportOptions): NodeJS.ReadableStream {
  const map: libCoverage.CoverageMap = toIstanbulCoverageMap(options.processCovs);
  const reportStreams: NodeJS.ReadableStream[] = [];
  const sourceFinder: (filepath: string) => string = createSourceFinder(options.processCovs);
  for (const reporter of options.reporters) {
    reportStreams.push(vinylReport(map, reports.create(reporter), sourceFinder));
  }
  return merge2(reportStreams);
}

export async function writeReport(options: ReportOptions): Promise<void> {
  function task(): NodeJS.ReadableStream {
    return report(options).pipe(vinylFs.dest(options.coverageDir));
  }

  return new Promise<void>((resolve, reject) => {
    asyncDone(task, (err: Error | null, res: void): void => {
      // TODO: Send PR to normalize lack of error to `null`
      if (err !== null && err !== undefined) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}
