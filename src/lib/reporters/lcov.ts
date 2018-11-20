import istanbulReports from "istanbul-reports";
import { StreamReporter } from "../reporter";
import { wrapStreamReporter } from "../wrap-istanbul-reporter";

export function createLcovReporter(): StreamReporter {
  return wrapStreamReporter(istanbulReports.create("lcovonly"));
}
