import libCoverage from "istanbul-lib-coverage";
import { istanbulize } from "istanbulize";
import { parseSys as parseNodeScriptUrl } from "node-script-url";
import sourceMap from "source-map";
import urlMod from "url";
import { Incident } from "incident";
import { GetText, getText as defaultGetText } from "./get-text";
import { mergeCovMaps } from "./istanbul-merge";
import { mergeRichProcessCovs } from "./merge";
import { addFromGeneratedFileCov } from "./source-map";
import { CoverageMapBuilder } from "./source-map/builder";
import { MemorySourceStore, NullableSourceText } from "./source-map/source-store";
import { RichProcessCov } from "./spawn-inspected";

export interface RichIstanbulCoverageMap {
  coverageMap: libCoverage.CoverageMap;
  sources: Map<string, NullableSourceText>;
}

export async function processCovsToIstanbul(
  processCovs: ReadonlyArray<RichProcessCov>,
  getText: GetText = defaultGetText,
): Promise<RichIstanbulCoverageMap> {
  const merged: RichProcessCov = mergeRichProcessCovs(processCovs);
  return toIstanbul(merged, getText);
}

/**
 * Convert to an istanbul coverage map (applying source maps).
 *
 * @param processCov Process coverage to convert.
 * @param getText Function used to load text from URLs (used to load source maps).
 */
async function toIstanbul(
  processCov: RichProcessCov,
  getText: GetText = defaultGetText,
): Promise<RichIstanbulCoverageMap> {
  const rawCoverageMap: libCoverage.CoverageMapData = toRawIstanbul(processCov);

  const generatedCovMap: libCoverage.CoverageMapData = Object.create(null);
  const originalBuilder: CoverageMapBuilder = new CoverageMapBuilder();
  const sourceStore: MemorySourceStore = new MemorySourceStore();

  for (const scriptCov of processCov.result) {
    const rawFileCov: libCoverage.FileCoverage = rawCoverageMap[scriptCov.url];
    let useOriginal: boolean = false;
    if (scriptCov.sourceMapUrl !== undefined && parseNodeScriptUrl(scriptCov.url).isFileUrl) {
      let sourceMapUrl: urlMod.URL;
      try {
        sourceMapUrl = new urlMod.URL(scriptCov.sourceMapUrl, scriptCov.url);
      } catch (err) {
        throw new Incident(
          err,
          "SourceMapUrlResolutionError",
          {url: scriptCov.url, sourceMapUrl: scriptCov.sourceMapUrl},
        );
      }
      let sourceMapString: string;
      try {
        sourceMapString = await getText(sourceMapUrl);
      } catch (err) {
        throw new Incident(
          err,
          "SourceMapReadError",
          {scriptUrl: scriptCov.url, sourceMapUrl: sourceMapUrl.href},
        );
      }
      const rawSourceMap: sourceMap.RawSourceMap = JSON.parse(sourceMapString);
      useOriginal = await addFromGeneratedFileCov(
        originalBuilder,
        sourceStore,
        rawFileCov,
        rawSourceMap,
        scriptCov.sourceMapUrl,
      );
    }

    if (!useOriginal) {
      sourceStore.set(scriptCov.url, scriptCov.sourceText);
      generatedCovMap[scriptCov.url] = rawFileCov;
    }
  }

  const coverageMap: libCoverage.CoverageMapData = mergeCovMaps([generatedCovMap, originalBuilder.build()]);

  return {
    coverageMap: libCoverage.createCoverageMap(coverageMap),
    sources: new Map(sourceStore),
  };
}

/**
 * Convert to an istanbul coverage map, without applying source maps.
 *
 * @param processCov Process coverage to convert.
 */
export function toRawIstanbul(processCov: RichProcessCov): libCoverage.CoverageMapData {
  const coverageMap: libCoverage.CoverageMapData = Object.create(null);

  for (const scriptCov of processCov.result) {
    try {
      const generatedFileCov: libCoverage.FileCoverageData = istanbulize({
        sourceType: scriptCov.sourceType,
        sourceText: scriptCov.sourceText,
        scriptCov,
      });
      coverageMap[scriptCov.url] = libCoverage.createFileCoverage(generatedFileCov);
    } catch (err) {
      const cause: Error = err;
      const message: string = `IstanbulizeFailure for the script ${JSON.stringify(scriptCov.url)}\n${err.message}`;
      const newErr: Error = Object.assign(new Error(message), {cause, scriptCov});
      throw newErr;
    }
  }

  return coverageMap;
}
