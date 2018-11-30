import { fromSysPath, toPosixPath } from "furi";
import minimatch from "minimatch";
import { ParsedScriptUrl, parseSys as parseNodeScriptUrl } from "node-script-url";
import sysPath from "path";
import url from "url";

export interface ModuleInfo {
  url: string;
  isModule?: boolean;
}

export type CoverageFilter = (info: ModuleInfo) => boolean;

export interface FromGlobOptions {
  patterns: ReadonlyArray<string>;

  /**
   * Base file URL for relative patterns.
   */
  base?: url.URL;
}

interface FuriMatch {
  type: "negative" | "positive";
  regexp: RegExp;
}

export function fromGlob(options: FromGlobOptions): CoverageFilter {
  let basePath: string | undefined;
  if (options.base !== undefined) {
    basePath = toPosixPath(options.base.href);
  }

  const matches: FuriMatch[] = [];
  const patterns: ReadonlyArray<string> = [...options.patterns, "**/*"];
  for (const pattern of patterns) {
    let absPattern: string;
    let type: "negative" | "positive";
    if (pattern.startsWith("!")) {
      absPattern = pattern.substr(1);
      type = "negative";
    } else {
      absPattern = pattern;
      type = "positive";
    }
    const resolvedPattern: string = basePath !== undefined ? sysPath.resolve(basePath, absPattern) : absPattern;
    matches.push({
      type,
      regexp: minimatch.makeRe(resolvedPattern, {dot: true}),
    });
    // Fix bad wildstar conversion to RegExp
    if (absPattern.startsWith("**/")) {
      const patternTail: string = absPattern.substr("**/".length);
      const resolvedPattern: string = basePath !== undefined ? sysPath.resolve(basePath, patternTail) : patternTail;
      matches.push({
        type,
        regexp: minimatch.makeRe(resolvedPattern, {dot: true}),
      });
    }
  }

  return function filter(info: ModuleInfo): boolean {
    if (!isRegularFile(info)) {
      return false;
    }
    const posixPath: string = toPosixPath(info.url);
    for (const match of matches) {
      if (match.regexp.test(posixPath)) {
        return match.type === "positive";
      }
    }
    return false;
  };
}

export function isRegularFile(info: ModuleInfo): boolean {
  return parseNodeScriptUrl(info.url).isFileUrl;
}

function inCwd(info: ModuleInfo): boolean {
  const scriptUrl: ParsedScriptUrl = parseNodeScriptUrl(info.url);
  if (!scriptUrl.isFileUrl) {
    return false;
  }
  const cwdFuri: string = fromSysPath(sysPath.resolve(process.cwd())).href;
  return isDescendantOf(scriptUrl.url, cwdFuri);
}

function isDescendantOf(curUrl: string, ancestorUrl: string): boolean {
  const cur: ReadonlyArray<string> = new url.URL(curUrl).pathname.split("/");
  const ancestor: ReadonlyArray<string> = new url.URL(ancestorUrl).pathname.split("/");
  for (const [i, segment] of ancestor.entries()) {
    if (cur[i] !== segment) {
      return false;
    }
  }
  return true;
}
