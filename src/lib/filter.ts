import sysPath from "path";
import url from "url";
import { parseSys as parseNodeScriptUrl, ScriptUrl } from "node-script-url";
import { fromSysPath } from "furi";

export interface ModuleInfo {
  url: string;
  isModule?: boolean;
}

export type CoverageFilter = (info: ModuleInfo) => boolean;

export function fromGlob(patterns: string[]): CoverageFilter {
  // TODO: Actually create a filter based on the glob
  // tslint:disable-next-line:no-console
  console.warn("NotImplemented: fromGlob (fallback to `() => inCwd`)");
  return inCwd;
}

function inCwd(info: ModuleInfo): boolean {
  const scriptUrl: ScriptUrl = parseNodeScriptUrl(info.url);
  if (!scriptUrl.isRegularFile) {
    return false;
  }
  const cwdFuri: string = fromSysPath(sysPath.resolve(process.cwd())).href;
  return scriptUrl.isRegularFile && isDescendantOf(scriptUrl.url, cwdFuri);
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
