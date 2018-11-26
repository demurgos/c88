import chai from "chai";
import { MessageAction, parseArgs, ParseArgsResult, RunAction } from "../lib/cli";
import { VERSION } from "../lib/version";

describe("cli", () => {
  describe("parseArgs", () => {
    it("[]", () => {
      const actual: MessageAction = parseArgs([]) as MessageAction;
      chai.assert.propertyVal(actual, "action", "message");
      chai.assert.instanceOf(actual.error, Error);
      chai.assert.notStrictEqual(actual.message, "");
    });

    it("[\"--version\"]", () => {
      const actual: MessageAction = parseArgs(["--version"]) as MessageAction;
      chai.assert.propertyVal(actual, "action", "message");
      chai.assert.isUndefined(actual.error);
      chai.assert.propertyVal(actual, "message", VERSION);
    });

    it("[\"--help\"]", () => {
      const actual: MessageAction = parseArgs(["--help"]) as MessageAction;
      chai.assert.propertyVal(actual, "action", "message");
      chai.assert.isUndefined(actual.error);
      chai.assert.notStrictEqual(actual.message, "");
    });

    it("[\"node\", \"foo.js\"]", () => {
      const actual: ParseArgsResult = parseArgs(["node", "foo.js"]) as ParseArgsResult;
      const expected: ParseArgsResult = {
        action: "run",
        config: {
          reporters: ["text"],
          globs: [
            "!coverage/**",
            "!packages/*/test/**",
            "!test/**",
            "!test{,-*}.js",
            "!**/*{.,-}test.js",
            "!**/__tests__/**",
            "!**/node_modules/**",
            "!node_modules/**",
          ],
          command: ["node", "foo.js"],
        },
      };
      chai.assert.deepEqual(actual, expected);
    });

    it("[\"--\", \"node\", \"--experimental-modules\", \"foo.mjs\"]", () => {
      const actual: ParseArgsResult = parseArgs(["--", "node", "--experimental-modules", "foo.mjs"]);
      const expected: ParseArgsResult = {
        action: "run",
        config: {
          reporters: ["text"],
          globs: [
            "!coverage/**",
            "!packages/*/test/**",
            "!test/**",
            "!test{,-*}.js",
            "!**/*{.,-}test.js",
            "!**/__tests__/**",
            "!**/node_modules/**",
          ],
          command: ["node", "--experimental-modules", "foo.mjs"],
        },
      };
      chai.assert.deepEqual(actual, expected);
    });
  });
});
