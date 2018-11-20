import libCoverage from "istanbul-lib-coverage";

export interface ReportOptions {
  map: libCoverage.CoverageMap;

  sourceFinder?(furi: string): string;
}

export interface Reporter {
  reportStream?(options: ReportOptions): NodeJS.ReadableStream;

  reportVinyl?(options: ReportOptions): NodeJS.ReadableStream;
}

export interface StreamReporter {

  reportStream(options: ReportOptions): NodeJS.ReadableStream;

  reportVinyl?(options: ReportOptions): NodeJS.ReadableStream;
}

export interface VinylReporter {
  reportStream?(options: ReportOptions): NodeJS.ReadableStream;

  reportVinyl(options: ReportOptions): NodeJS.ReadableStream;

}
