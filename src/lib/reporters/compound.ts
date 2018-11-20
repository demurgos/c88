import istanbulReports from "istanbul-reports";
import merge2 from "merge2";
import { Reporter, ReportOptions, StreamReporter, VinylReporter } from "../reporter";
import { wrapStreamReporter } from "../wrap-istanbul-reporter";

export class CompoundReporter implements Reporter {
  private readonly streamReporters: ReadonlyArray<StreamReporter>;
  private readonly vinylReporters: ReadonlyArray<VinylReporter>;

  constructor(reporters: ReadonlyArray<Reporter>) {
    const streamReporters: StreamReporter[] = [];
    const vinylReporters: VinylReporter[] = [];
    for (const reporter of reporters) {
      if (reporter.reportStream !== undefined) {
        streamReporters.push(reporter as StreamReporter);
      }
      if (reporter.reportVinyl !== undefined) {
        vinylReporters.push(reporter as VinylReporter);
      }
    }
    this.streamReporters = streamReporters;
    this.vinylReporters = vinylReporters;
  }

  public reportStream(options: ReportOptions): NodeJS.ReadableStream {
    const streams: NodeJS.ReadableStream[] = [];
    for (const reporter of this.streamReporters) {
      streams.push(reporter.reportStream(options));
    }
    return merge2(streams);
  }

  public reportVinyl(options: ReportOptions): NodeJS.ReadableStream {
    const streams: NodeJS.ReadableStream[] = [];
    for (const reporter of this.vinylReporters) {
      streams.push(reporter.reportVinyl(options));
    }
    return merge2(streams);
  }
}
