import istanbulReports from "istanbul-reports";
import { StreamReporter, VinylReporter } from "../reporter";
import { toVinylOnlyReporter, wrapStreamReporter } from "../wrap-istanbul-reporter";

export function createLcovReporter(): StreamReporter {
  return wrapStreamReporter(istanbulReports.create("lcovonly"));
}

export function createLcovFileReporter(): VinylReporter {
  return toVinylOnlyReporter(createLcovReporter(), "lcov.info");
}
