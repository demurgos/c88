import libCoverage from "istanbul-lib-coverage";

export function mergeCovMaps(covMaps: ReadonlyArray<libCoverage.CoverageMapData>): libCoverage.CoverageMapData {
  const merged: libCoverage.CoverageMapData = Object.create(null);
  for (const covMap of covMaps) {
    for (const fileCov of Object.values(covMap)) {
      if (Reflect.get(merged, fileCov.path) !== undefined) {
        throw new Error(`DuplicateFileCoverage: ${fileCov.path}`);
      }
      Reflect.set(merged, fileCov.path, fileCov);
    }
  }
  return merged;
}
