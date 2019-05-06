import dataUrls from "data-urls";
import fs from "fs";
import urlMod from "url";
import whatwgEncoding from "whatwg-encoding";
import { NullableSourceText } from "./source-map/source-store";

/**
 * Returns the `string` corresponding to the provided URL record.
 */
export type GetText = (url: Readonly<urlMod.URL>) => Promise<string>;

/**
 * Synchronous variant of `GetText`.
 */
export type GetTextSync = (url: Readonly<urlMod.URL>) => string;

// TODO: Find out why TSLint complains about whitespace
// tslint:disable:whitespace
/**
 * Returns the string corresponding to the provided `url`.
 *
 * @param url URL for the text content.
 */
export async function getText(url: Readonly<urlMod.URL>): Promise<string> {
  switch (url.protocol) {
    case "data:":
      return getTextByDataUrl(url);
    case "file:":
      return getTextByFileUrl(url);
    default:
      throw new Error(`UnsupportedProtocol ${url.protocol} for: ${url}`);
  }
}
// tslint:enable

/**
 * Synchronous variant of `getText`.
 */
export function getTextSync(url: Readonly<urlMod.URL>): string {
  switch (url.protocol) {
    case "data:":
      return getTextByDataUrl(url);
    case "file:":
      return getTextByFileUrlSync(url);
    default:
      throw new Error(`UnsupportedProtocol ${url.protocol} for: ${url}`);
  }
}

export function getTextByDataUrl(url: Readonly<urlMod.URL>): string {
  const parsed: dataUrls.DataURL | null = dataUrls(url.toString());
  if (parsed === null) {
    throw new Error(`CannotParseDataUrl: ${url}`);
  }
  const charset: string | undefined = parsed.mimeType.parameters.get("charset");
  let encodingName: string | null;
  if (charset !== undefined) {
    encodingName = whatwgEncoding.labelToName(charset);
  } else {
    // Not sure what the default should be...
    encodingName = "UTF-8";
  }
  if (encodingName === null) {
    throw new Error(`Unable to resolve encoding for data URL: ${url}`);
  }
  return whatwgEncoding.decode(parsed.body, encodingName);
}

export async function getTextByFileUrl(url: Readonly<urlMod.URL>): Promise<string> {
  return fs.promises.readFile(url, {encoding: "UTF-8"}) as Promise<string>;
}

export function getTextByFileUrlSync(url: Readonly<urlMod.URL>): string {
  return fs.readFileSync(url, {encoding: "UTF-8"});
}

export function getTextSyncFromSourceStore(_sources: Iterable<[string, NullableSourceText]>): GetTextSync {
  const cache: Map<string, NullableSourceText> = new Map();
  return (url: Readonly<urlMod.URL>): string => {
    const cached: NullableSourceText | undefined = cache.get(url.toString());
    if (typeof cached === "string") {
      return cached;
    }
    const sourceText: string = getTextSync(url);
    cache.set(url.toString(), sourceText);
    return sourceText;
  };
}
