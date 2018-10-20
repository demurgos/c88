import chai from "chai";
import { MessageAction, parseArgs, RunAction } from "../lib/cli";
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
      const actual = parseArgs(["--version"]) as MessageAction;
      chai.assert.propertyVal(actual, "action", "message");
      chai.assert.isUndefined(actual.error);
      chai.assert.propertyVal(actual, "message", VERSION);
    });

    it("[\"--help\"]", () => {
      const actual = parseArgs(["--help"]) as MessageAction;
      chai.assert.propertyVal(actual, "action", "message");
      chai.assert.isUndefined(actual.error);
      chai.assert.notStrictEqual(actual.message, "");
    });

    it("[\"node\", \"foo.js\"]", () => {
      const actual = parseArgs(["node", "foo.js"]) as RunAction;
      chai.assert.propertyVal(actual, "action", "run");
      chai.assert.isDefined(actual.config);
    });
  });
});
