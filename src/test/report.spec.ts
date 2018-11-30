import chai from "chai";
import { ParsedScriptUrl, parseSys as parseNodeScriptUrl } from "node-script-url";
import path from "path";
import { ModuleInfo } from "../lib/filter";
import { GetTextSync, getTextSyncFromSourceStore } from "../lib/get-text";
import { reportStream } from "../lib/report";
import { StreamReporter } from "../lib/reporter";
import { createTextReporter } from "../lib/reporters/text";
import { RichProcessCov, spawnInspected } from "../lib/spawn-inspected";
import { processCovsToIstanbul } from "../lib/to-istanbul";

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

describe("report", () => {
  describe("node normal.js", () => {
    const FIXTURE: string = require.resolve("./fixtures/normal.js");

    it("text", async function test(this: Mocha.Context) {
      this.timeout(10000);

      const processCovs: RichProcessCov[] = await spawnInspected(
        process.execPath,
        [FIXTURE],
        {filter: inFixturesDirectory},
      );
      const reporter: StreamReporter = createTextReporter();
      const {coverageMap, sources} = await processCovsToIstanbul(processCovs);
      const getSourcesSync: GetTextSync = getTextSyncFromSourceStore(sources);
      const stream: NodeJS.ReadableStream = reportStream(reporter, coverageMap, getSourcesSync);

      const expected: string = [
        "------------|----------|----------|----------|----------|-------------------|",
        "File        |  % Stmts | % Branch |  % Funcs |  % Lines | Uncovered Line #s |",
        "------------|----------|----------|----------|----------|-------------------|",
        "All files   |      100 |      100 |       80 |      100 |                   |",
        " normal.js  |      100 |      100 |       50 |      100 |                   |",
        " timeout.js |      100 |      100 |      100 |      100 |                   |",
        "------------|----------|----------|----------|----------|-------------------|",
        "",
      ].join("\n");

      const actual: string = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer): any => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("UTF-8")));
      });

      chai.assert.strictEqual(actual, expected);
    });
  });

  describe("node source-map/inline-map/main.js", () => {
    const FIXTURE: string = require.resolve("./fixtures/source-map/inline-map/main.js");

    it("text", async function test(this: Mocha.Context) {
      this.timeout(10000);

      const processCovs: RichProcessCov[] = await spawnInspected(
        process.execPath,
        [FIXTURE],
        {filter: inFixturesDirectory},
      );
      const reporter: StreamReporter = createTextReporter();
      const {coverageMap, sources} = await processCovsToIstanbul(processCovs);
      const getSourcesSync: GetTextSync = getTextSyncFromSourceStore(sources);
      const stream: NodeJS.ReadableStream = reportStream(reporter, coverageMap, getSourcesSync);

      const expected: string = [
        "----------|----------|----------|----------|----------|-------------------|",
        "File      |  % Stmts | % Branch |  % Funcs |  % Lines | Uncovered Line #s |",
        "----------|----------|----------|----------|----------|-------------------|",
        "All files |      100 |      100 |      100 |      100 |                   |",
        " main.ts  |      100 |      100 |      100 |      100 |                   |",
        "----------|----------|----------|----------|----------|-------------------|",
        "",
      ].join("\n");

      const actual: string = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer): any => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("UTF-8")));
      });

      chai.assert.strictEqual(actual, expected);
    });
  });
});
