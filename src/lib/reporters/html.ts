import istanbulReports from "istanbul-reports";
import { VinylReporter } from "../reporter";
import { wrapFileReporter } from "../wrap-istanbul-reporter";

export function createHtmlReporter(): VinylReporter {
  return wrapFileReporter(istanbulReports.create("html"));
}
