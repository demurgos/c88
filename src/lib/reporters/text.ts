import istanbulReports from "istanbul-reports";
import { StreamReporter } from "../reporter";
import { wrapStreamReporter } from "../wrap-istanbul-reporter";

export function createTextReporter(): StreamReporter {
  return wrapStreamReporter(istanbulReports.create("text"));
}
