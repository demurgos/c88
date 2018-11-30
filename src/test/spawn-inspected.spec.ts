import chai from "chai";
import { ParsedScriptUrl, parseSys as parseNodeScriptUrl } from "node-script-url";
import path from "path";
import { ModuleInfo } from "../lib/filter";
import { RichProcessCov, spawnInspected } from "../lib/spawn-inspected";

function inFixturesDirectory(info: ModuleInfo): boolean {
  const scriptUrl: ParsedScriptUrl = parseNodeScriptUrl(info.url);
  if (!scriptUrl.isFileUrl) {
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

describe("spawnInspected", () => {
  describe("node normal.js", () => {
    const FIXTURE: string = require.resolve("./fixtures/normal.js");

    it("runs it successfully and collect V8 coverage", async () => {
      const processCovs: RichProcessCov[] = await spawnInspected(
        process.execPath,
        [FIXTURE],
        {filter: inFixturesDirectory},
      );
      chai.assert.isArray(processCovs);
      chai.assert.lengthOf(processCovs, 1);
      chai.assert.isArray(processCovs[0].result);
      chai.assert.lengthOf(processCovs[0].result, 2);
    });
  });

  describe("node --experimental-modules hello-world.mjs", () => {
    const FIXTURE: string = require.resolve("./fixtures/hello-world.mjs");

    it("runs it successfully and collect V8 coverage", async () => {
      const processCovs: RichProcessCov[] = await spawnInspected(
        process.execPath,
        ["--experimental-modules", FIXTURE],
        {filter: inFixturesDirectory},
      );
      chai.assert.isArray(processCovs);
      chai.assert.lengthOf(processCovs, 1);
      chai.assert.isArray(processCovs[0].result);
      chai.assert.lengthOf(processCovs[0].result, 1);
    });
  });
});
