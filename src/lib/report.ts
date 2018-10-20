import { mergeProcessCovs, ProcessCov } from "@c88/v8-coverage";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";
import { IstanbulFileCoverageData, istanbulize, SourceType, unwrapScriptCov, unwrapSourceText } from "istanbulize";
import { SourcedProcessCov } from "./spawn-instrumented";

export type IstanbulReporter = "text" | "lcov-only";

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

export async function writeReports(options: ReportOptions): Promise<void> {
  const urlToScriptData: Map<string, ScriptData> = new Map();
  for (const processCov of options.processCovs) {
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

  const merged: ProcessCov = mergeProcessCovs(options.processCovs);

  const map = libCoverage.createCoverageMap({});
  for (const scriptCov of merged.result) {
    const {sourceType, sourceText} = urlToScriptData.get(scriptCov.url)!;
    const istanbulCoverage: IstanbulFileCoverageData = istanbulize({
      sourceType,
      sourceText: sourceType === SourceType.Script ? unwrapSourceText(sourceText) : sourceText,
      scriptCov: sourceType === SourceType.Script ? unwrapScriptCov(scriptCov) : scriptCov,
    });
    map.merge({[istanbulCoverage.path]: istanbulCoverage});
  }
  const tree = libReport.summarizers.pkg(map);
  const context = libReport.createContext({
    dir: options.coverageDir,
    watermarks: options.watermarks,
  });

  for (const reporter of options.reporters) {
    tree.visit(reports.create(reporter), context);
  }
}
