#!/usr/bin/env node

import { execCli } from "../cli";

async function main(): Promise<never> {
  const args: string[] = process.argv.slice(2);
  const cwd: string = process.cwd();
  const proc: any = process;
  const returnCode: number = await execCli(args, cwd, proc);
  return process.exit(returnCode) as never;
}

main();
