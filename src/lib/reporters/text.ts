import istanbulReports from "istanbul-reports";
import { StreamReporter, VinylReporter } from "../reporter";
import { toVinylOnlyReporter, wrapStreamReporter } from "../wrap-istanbul-reporter";

export function createTextReporter(): StreamReporter {
  return wrapStreamReporter(istanbulReports.create("text"));
}

export function createTextFileReporter(): VinylReporter {
  return toVinylOnlyReporter(createTextReporter(), "coverage.txt");
}
