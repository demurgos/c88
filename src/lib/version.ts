import findUp from "find-up";
import fs from "fs";

const packagePath: string | null = findUp.sync("package.json");

if (packagePath === null) {
  throw new Error("Cannot find `package.json`");
}

const pkg: any = JSON.parse(fs.readFileSync(packagePath, {encoding: "UTF-8"}));

/**
 * `c8` version.
 */
export const VERSION: string = pkg.version;
