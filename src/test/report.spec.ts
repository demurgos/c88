import chai from "chai";
import { parseSys as parseNodeScriptUrl, ScriptUrl } from "node-script-url";
import path from "path";
import { ModuleInfo } from "../lib/filter";
import { reportStream } from "../lib/report";
import { StreamReporter } from "../lib/reporter";
import { createTextReporter } from "../lib/reporters/text";
import { SourcedProcessCov, spawnInstrumented } from "../lib/spawn-instrumented";

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

    it("text", async function test(this: Mocha.Context) {
      this.timeout(10000);

      const processCovs: SourcedProcessCov[] = await spawnInstrumented(process.execPath, [FIXTURE], inFixturesDirectory);
      const reporter: StreamReporter = createTextReporter();
      const stream: NodeJS.ReadableStream = reportStream(reporter, processCovs);

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
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", (err) => reject(err));
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("UTF-8")));
      });

      chai.assert.strictEqual(actual, expected);
    });
  });
});
