import libCoverage from "istanbul-lib-coverage";
import sourceMap from "source-map";
import url from "url";
import { CoverageMapBuilder } from "./builder";
import { SourceStore } from "./source-store";

/**
 * A range in a source text identified by its `url`.
 */
export interface SourceLocationWithUrl extends SourceLocation {
  /**
   * URL of the file containing this location.
   */
  readonly url: string;
}

/**
 * A (possibly empty) range in the source text.
 */
export interface SourceLocation {
  /**
   * Start position.
   */
  readonly start: Position;

  /**
   * End position.
   */
  readonly end: Position;
}

/**
 * A position in the source text.
 */
export interface Position {
  /**
   * 1-based line index.
   *
   * Must satisfy `line >= 1`.
   */
  readonly line: number;

  /**
   * 0-based column index.
   *
   * Must satisfy `column >= 0`.
   */
  readonly column: number;
}

/**
 * Adds content from a generated-file coverage using source maps.
 *
 * @param covMapBuilder Coverage map builder to use for the original coverages.
 * @param sourceStore Store where inlined source texts will be added.
 * @param generatedFileCov File coverage to process.
 * @param rawSourceMap Raw source map corresponding to the file to process.
 * @param sourceMapUrl Optional URL of the source map.
 */
export async function addFromGeneratedFileCov(
  covMapBuilder: CoverageMapBuilder,
  sourceStore: SourceStore,
  generatedFileCov: libCoverage.FileCoverageData,
  rawSourceMap: sourceMap.RawSourceMap,
  sourceMapUrl?: string,
): Promise<boolean> {
  return sourceMap.SourceMapConsumer.with(
    rawSourceMap,
    undefined, // sourceMapUrl,
    // TODO: Fix `souce-map.d.ts` type definitions
    <(smc: any) => Promise<boolean>> (async (smc: sourceMap.BasicSourceMapConsumer): Promise<boolean> => {
      const didUpdateSources: boolean = addSourceTexts(sourceStore, smc, generatedFileCov.path);
      const didUpdateCovMap: boolean = addOriginalFileCovs(covMapBuilder, smc, generatedFileCov);
      return didUpdateSources || didUpdateCovMap;
    }),
  );
}

/**
 * Adds the source texts embedded in the source map to the source store.
 *
 * @param sourceStore Source store where the source texts will be added.
 * @param smc Source map consumer to use for the extraction.
 * @param generatedUrl URL of the generated file.
 * @returns Boolean indicating of the source store was updated.
 */
export function addSourceTexts(
  sourceStore: SourceStore,
  smc: sourceMap.BasicSourceMapConsumer,
  generatedUrl: string,
): boolean {
  let didUpdate: boolean = false;
  for (const [url, sourceText] of getSourceTexts(smc, generatedUrl)) {
    const curDidUpdate: boolean = sourceStore.set(url, sourceText);
    didUpdate = didUpdate || curDidUpdate;
  }
  return didUpdate;
}

/**
 * Extracts the source texts embedded in the source map.
 *
 * This function can be used to extract inlined source text for example.
 *
 * @param smc Source map consumer to use for the extraction.
 * @param generatedUrl URL of the generated file.
 * @returns Iterator of `[url, sourceText]`. `url` is absolute.
 */
export function* getSourceTexts(
  smc: sourceMap.BasicSourceMapConsumer,
  generatedUrl: string,
): IterableIterator<[string, string]> {
  for (const source of smc.sources) {
    const sourceText: string | null = smc.sourceContentFor(source);
    if (sourceText === null) {
      continue;
    }
    const originalUrl: string = url.resolve(generatedUrl, source);
    yield [originalUrl, sourceText];
  }
}

/**
 * Adds the original file coverages to the provided builders map.
 *
 * @param covMapBuilder Coverage map builder to use for the original coverages.
 * @param smc Source map consumer to use.
 * @param generatedFileCov File coverage for the generated file.
 * @returns Boolean indicating if the builder was updated.
 */
export function addOriginalFileCovs(
  covMapBuilder: CoverageMapBuilder,
  smc: sourceMap.BasicSourceMapConsumer,
  generatedFileCov: libCoverage.FileCoverageData,
): boolean {
  let didUpdate: boolean = false;
  const generatedUrl: string = generatedFileCov.path;

  for (const [key, loc] of Object.entries(generatedFileCov.statementMap)) {
    const count: number = generatedFileCov.s[key];
    const originalLoc: SourceLocationWithUrl | undefined = tryGetOriginalLocation(smc, generatedUrl, loc);
    if (originalLoc === undefined) {
      continue;
    }
    covMapBuilder.addStatement(originalLoc.url, originalLoc, count);
    didUpdate = true;
  }

  for (const [key, funcMapping] of Object.entries(generatedFileCov.fnMap)) {
    const count: number = generatedFileCov.f[key];
    const originalDecl: SourceLocationWithUrl | undefined = tryGetOriginalLocation(smc, generatedUrl, funcMapping.decl);
    const originalLoc: SourceLocationWithUrl | undefined = tryGetOriginalLocation(smc, generatedUrl, funcMapping.loc);
    if (originalDecl === undefined || originalLoc === undefined || originalDecl.url !== originalLoc.url) {
      continue;
    }
    covMapBuilder.addFunction(originalDecl.url, originalDecl, originalLoc, count, funcMapping.name);
    didUpdate = true;
  }

  branches: for (const [key, branchMapping] of Object.entries(generatedFileCov.branchMap)) {
    const counts: ReadonlyArray<number> = generatedFileCov.b[key];
    const mainLoc: SourceLocation = branchMapping.loc;
    const originalMainLoc: SourceLocationWithUrl | undefined = tryGetOriginalLocation(smc, generatedUrl, mainLoc);
    if (originalMainLoc === undefined) {
      continue;
    }
    const arms: [SourceLocation, number][] = [];
    for (const [i, loc] of branchMapping.locations.entries()) {
      const count: number = counts[i];
      const originalLoc: SourceLocationWithUrl | undefined = tryGetOriginalLocation(smc, generatedUrl, loc);
      if (originalLoc === undefined || originalLoc.url !== originalMainLoc.url) {
        continue branches;
      }
      arms.push([originalLoc, count]);
    }
    covMapBuilder.addBranch(originalMainLoc.url, originalMainLoc, arms, branchMapping.type);
    didUpdate = true;
  }

  return didUpdate;
}

/**
 * Tries to return the corresponding original range.
 *
 * The function returns `undefined` in the `start` or `end` positions cannot
 * be fully resolved (`source`, `line` and `column`) or the `source` does not
 * match.
 *
 * @param smc Source map consumer to use.
 * @param generatedUrl Absolute URL of the generated file.
 * @param generatedLocation Source location from the generated file.
 */
function tryGetOriginalLocation(
  smc: sourceMap.BasicSourceMapConsumer,
  generatedUrl: string,
  generatedLocation: SourceLocation,
): SourceLocationWithUrl | undefined {
  // `oStart`: `originalStart`
  const oStart: sourceMap.NullableMappedPosition = smc.originalPositionFor({
    ...generatedLocation.start,
    bias: sourceMap.SourceMapConsumer.LEAST_UPPER_BOUND,
  });

  if (oStart.source === null || oStart.line === null || oStart.column === null) {
    // Unable to fully resolve the start position.
    return undefined;
  }

  // `oEnd`: `originalEnd`
  let oEnd: sourceMap.NullableMappedPosition = smc.originalPositionFor({
    ...generatedLocation.end,
    bias: sourceMap.SourceMapConsumer.LEAST_UPPER_BOUND,
  });

  if (oEnd.source === oStart.source && oEnd.line === oStart.line && oEnd.column === oStart.column) {
    // `oEnd` === `oStart`, try to use the other bias
    oEnd = smc.originalPositionFor({
      ...generatedLocation.end,
      bias: sourceMap.SourceMapConsumer.GREATEST_LOWER_BOUND,
    });
  }

  if (oEnd.source === null || oEnd.line === null || oEnd.column === null) {
    // Unable to fully resolve the end position.
    return undefined;
  }

  if (oEnd.source !== oStart.source) {
    return undefined;
  }

  const originalUrl: string = url.resolve(generatedUrl, oStart.source);

  return {
    url: originalUrl,
    start: {line: oStart.line, column: oStart.column},
    end: {line: oEnd.line, column: oEnd.column},
  };
}
