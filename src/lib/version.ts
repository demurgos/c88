import findUp from "find-up";
import fs from "fs";

const packagePath: string | undefined = findUp.sync("package.json");

if (packagePath === undefined) {
  throw new Error("Cannot find `package.json`");
}

const pkg: any = JSON.parse(fs.readFileSync(packagePath, {encoding: "UTF-8"}));

/**
 * `c88` version.
 */
export const VERSION: string = pkg.version;
