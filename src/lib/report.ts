import libCoverage from "istanbul-lib-coverage";
import urlMod from "url";
import { GetTextSync, getTextSync as defaultGetTextSync } from "./get-text";
import { Reporter, StreamReporter, VinylReporter } from "./reporter";
import { ReporterRegistry } from "./reporter-registry";
import { CompoundReporter } from "./reporters/compound";

export function createReporter(registry: ReporterRegistry, ids: ReadonlyArray<string>, options: any): Reporter {
  const reporters: Reporter[] = [];
  for (const id of ids) {
    reporters.push(registry.create(id, options));
  }
  return reporters.length === 1 ? reporters[0] : new CompoundReporter(reporters);
}

export function reportVinyl(
  reporter: VinylReporter,
  covMap: libCoverage.CoverageMap,
  getTextSync: GetTextSync = defaultGetTextSync,
): NodeJS.ReadableStream {
  return reporter.reportVinyl({map: covMap, sourceFinder: (url => getTextSync(new urlMod.URL(url)))});
}

export function reportStream(
  reporter: StreamReporter,
  covMap: libCoverage.CoverageMap,
  getTextSync: GetTextSync = defaultGetTextSync,
): NodeJS.ReadableStream {
  return reporter.reportStream({map: covMap, sourceFinder: (url => getTextSync(new urlMod.URL(url)))});
}
