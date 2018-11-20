import { parseSys as parseNodeScriptUrl, ScriptUrl } from "node-script-url";
import path from "path";
import { ModuleInfo } from "../lib/filter";
import { SourcedProcessCov, spawnInstrumented } from "../lib/spawn-instrumented";
import { writeReport } from "../lib/report";

function inFixturesDirectory(info: ModuleInfo): boolean {
  const scriptUrl: ScriptUrl = parseNodeScriptUrl(info.url);
  if (!scriptUrl.isRegularFile) {
    return false;
  }
  return isDescendantOf(scriptUrl.path, path.resolve(__dirname, "fixtures"));
}

function isDescendantOf(descendantPath: string, ancestorPath: string): boolean {
  if (descendantPath === ancestorPath) {
    return false;
  }
  while (descendantPath !== path.dirname(descendantPath)) {
    descendantPath = path.dirname(descendantPath);
    if (descendantPath === ancestorPath) {
      return true;
    }
  }
  return false;
}

describe("report", () => {
  describe("node normal.js", () => {
    const FIXTURE = require.resolve("./fixtures/normal.js");

    it("runs it successfully and collect V8 coverage", async () => {
      const processCovs: SourcedProcessCov[] = await spawnInstrumented(process.execPath, [FIXTURE], inFixturesDirectory);
      await writeReport({
        processCovs,
        reporters: ["text"],
        watermarks: undefined,
        coverageDir: "coverage",
      });
    });
  });
});
