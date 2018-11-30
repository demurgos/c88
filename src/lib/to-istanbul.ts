import libCoverage from "istanbul-lib-coverage";
import { istanbulize, SourceType, unwrapScriptCov, unwrapSourceText } from "istanbulize";
import { parseSys as parseNodeScriptUrl } from "node-script-url";
import sourceMap from "source-map";
import urlMod from "url";
import { GetText, getText as defaultGetText } from "./get-text";
import { mergeCovMaps } from "./istanbul-merge";
import { mergeRichProcessCovs } from "./merge";
import { addFromGeneratedFileCov } from "./source-map";
import { CoverageMapBuilder } from "./source-map/builder";
import { MemorySourceStore, NullableSourceText } from "./source-map/source-store";
import { RichProcessCov, RichScriptCov } from "./spawn-inspected";

export interface RichIstanbulCoverageMap {
  coverageMap: libCoverage.CoverageMap;
  sources: Map<string, NullableSourceText>;
}

export async function processCovsToIstanbul(
  processCovs: ReadonlyArray<RichProcessCov>,
  getText: GetText = defaultGetText,
  unwrapCjs: boolean = true,
): Promise<RichIstanbulCoverageMap> {
  const merged: RichProcessCov = mergeRichProcessCovs(processCovs);
  const processCov: RichProcessCov = unwrapCjs ? normalizeProcessCov(merged) : merged;
  return toIstanbul(processCov, getText);
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
      const sourceMapString: string = await getText(new urlMod.URL(scriptCov.sourceMapUrl));
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

export function normalizeProcessCov(processCov: RichProcessCov): RichProcessCov {
  return {...processCov, result: processCov.result.map(normalizeScriptCov)};
}

export function normalizeScriptCov(scriptCov: RichScriptCov): RichScriptCov {
  const sourceType: SourceType = scriptCov.sourceType;
  if (sourceType !== SourceType.Script) {
    return scriptCov;
  }
  const sourceText: string = unwrapSourceText(scriptCov.sourceText);
  const {functions} = unwrapScriptCov(scriptCov);
  return {...scriptCov, functions, sourceText};
}

/**
 * Convert to an istanbul coverage map, without applying source maps.
 *
 * @param processCov Process coverage to convert.
 */
export function toRawIstanbul(processCov: RichProcessCov): libCoverage.CoverageMapData {
  const coverageMap: libCoverage.CoverageMapData = Object.create(null);

  for (const scriptCov of processCov.result) {
    const generatedFileCov: libCoverage.FileCoverageData = istanbulize({
      sourceType: scriptCov.sourceType,
      sourceText: scriptCov.sourceText,
      scriptCov,
    });
    coverageMap[scriptCov.url] = libCoverage.createFileCoverage(generatedFileCov);
  }

  return coverageMap;
}
