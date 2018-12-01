#!/usr/bin/env node

import { execCli } from "../cli";

async function main(): Promise<void | never> {
  const args: string[] = process.argv.slice(2);
  const cwd: string = process.cwd();
  const returnCode: number = await execCli(args, cwd, process);
  if (returnCode !== 0) {
    process.exit(returnCode);
  }
}

main();
