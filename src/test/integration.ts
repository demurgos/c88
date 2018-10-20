import chai from "chai";
import childProcess from "child_process";
import sysPath from "path";

const c8Path = require.resolve("../../build/bin/c8");

chai.should();

describe("c88", () => {
  it("reports coverage for script that exits normally", () => {
    const {stdout} = childProcess.spawnSync(process.execPath, [
      c8Path,
      process.execPath,
      require.resolve("./fixtures/normal"),
    ], {
      env: process.env,
      cwd: sysPath.join(__dirname, "fixtures"),
    });
    stdout.toString("UTF-8").should.include(`------------|----------|----------|----------|----------|-------------------|
File        |  % Stmts | % Branch |  % Funcs |  % Lines | Uncovered Line #s |
------------|----------|----------|----------|----------|-------------------|
All files   |    89.58 |      100 |    66.67 |      100 |                   |
 normal.js  |    86.67 |      100 |       50 |      100 |                   |
 timeout.js |    94.44 |      100 |       80 |      100 |                   |
------------|----------|----------|----------|----------|-------------------|`);
  });
});
