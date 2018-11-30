import chai from "chai";
import childProcess from "child_process";
import sysPath from "path";

const c8Path: string = require.resolve("../lib/bin/c88");

chai.should();

describe("c88", () => {
  it("reports coverage for script that exits normally", function (this: Mocha.Context) {
    this.timeout(10000);

    const {stdout} = childProcess.spawnSync(process.execPath, [
      c8Path,
      process.execPath,
      require.resolve("./fixtures/normal"),
    ], {
      env: process.env,
      cwd: sysPath.join(__dirname, "fixtures"),
    });

    const expected: string = [
      "------------|----------|----------|----------|----------|-------------------|",
      "File        |  % Stmts | % Branch |  % Funcs |  % Lines | Uncovered Line #s |",
      "------------|----------|----------|----------|----------|-------------------|",
      "All files   |      100 |      100 |       80 |      100 |                   |",
      " normal.js  |      100 |      100 |       50 |      100 |                   |",
      " timeout.js |      100 |      100 |      100 |      100 |                   |",
      "------------|----------|----------|----------|----------|-------------------|",
    ].join("\n");

    stdout.toString("UTF-8").should.include(expected);
  });
});
