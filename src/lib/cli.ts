import assert from "assert";
import findUp from "find-up";
import fs from "fs";
import Exclude from "test-exclude";
import vinylFs from "vinyl-fs";
import yargs from "yargs";
import { asyncDonePromise } from "./async-done-promise";
import { CoverageFilter, fromGlob } from "./filter";
import { createReporter, reportStream, reportVinyl } from "./report";
import { Reporter, StreamReporter, VinylReporter } from "./reporter";
import { DEFAULT_REGISTRY } from "./reporter-registry";
import { SourcedProcessCov, spawnInstrumented } from "./spawn-instrumented";
import { VERSION } from "./version";

interface Watermarks {
  lines: [number, number];
  functions: [number, number];
  branches: [number, number];
  statements: [number, number];
}

export interface FileConfig {
  reporters?: string[];
  exclude?: string[];
  include?: string[];
  coverageDir?: string;
  waterMarks?: Watermarks;
}

export interface CliConfig {
  reporters?: string[];
  exclude?: string[];
  include?: string[];
  coverageDir?: string;
  command: string[];
}

export interface ResolvedConfig {
  reporters: string[];
  exclude: string[];
  include: string[];
  coverageDir: string;
  waterMarks: Watermarks;
  command: string[];
}

export interface MessageAction {
  action: "message";
  message: string;
  error?: Error;
}

export interface RunAction {
  action: "run";
  config: ResolvedConfig;
}

export type CliAction = MessageAction | RunAction;

export type ParseArgsResult = MessageAction | {action: "run"; config: CliConfig};

const DEFAULT_WATERMARKS: Watermarks = Object.freeze({
  lines: [80, 95] as [number, number],
  functions: [80, 95] as [number, number],
  branches: [80, 95] as [number, number],
  statements: [80, 95] as [number, number],
});

// TODO: Fix yargs type definition
const ARG_PARSER: yargs.Argv = yargs() as any;

ARG_PARSER
  .scriptName("c8")
  .version(VERSION)
  .usage("$0 [opts] [script] [opts]")
  .locale("en")
  .option("reporter", {
    alias: "r",
    describe: "coverage reporter(s) to use",
    default: "text",
  })
  .option("exclude", {
    alias: "x",
    default: Exclude.defaultExclude,
    describe: "a list of specific files and directories that should be excluded from coverage, glob patterns are supported.",
  })
  .option("include", {
    alias: "n",
    default: [],
    describe: "a list of specific files that should be covered, glob patterns are supported",
  })
  .option("coverage-directory", {
    default: "coverage",
    describe: "directory to output coverage JSON and reports",
  })
  .pkgConf("c88")
  .demandCommand(1)
  .epilog("visit https://git.io/vHysA for list of available reporters");

/**
 * Executes the c8 CLI
 * @param args
 * @param cwd
 * @param proc
 */
export async function execCli(args: string[], cwd: string, proc: NodeJS.Process): Promise<number> {
  const action: CliAction = await getAction(args, cwd);

  switch (action.action) {
    case "message":
      process.stderr.write(Buffer.from(action.message));
      return action.error === undefined ? 0 : 1;
    case "run":
      return execRunAction(action, cwd, proc);
    default:
      throw new Error(`AssertionError: Unexpected \`action\`: ${(action as any).action}`);
  }
}

function resolveConfig(fileConfig: FileConfig, cliConfig: CliConfig): ResolvedConfig {
  return {
    command: cliConfig.command,
    reporters: cliConfig.reporters !== undefined ? cliConfig.reporters : ["text"],
    exclude: cliConfig.exclude !== undefined ? cliConfig.exclude : ["test/*.js"],
    include: cliConfig.include !== undefined ? cliConfig.include : [],
    waterMarks: fileConfig.waterMarks !== undefined ? fileConfig.waterMarks : DEFAULT_WATERMARKS,
    coverageDir: cliConfig.coverageDir !== undefined ? cliConfig.coverageDir : "coverage",
  };
}

async function execRunAction({config}: RunAction, cwd: string, proc: NodeJS.Process): Promise<number> {
  const file: string = config.command[0];
  const args: string[] = config.command.slice(1);
  const filter: CoverageFilter = fromGlob([]); // TODO: Pass include/exclude.
  const processCovs: SourcedProcessCov[] = await spawnInstrumented(file, args, filter);
  const reportOptions: any = {
    waterMarks: config.waterMarks,
  };

  const reporter: Reporter = createReporter(DEFAULT_REGISTRY, config.reporters, reportOptions);
  const tasks: Array<Promise<void>> = [];
  if (reporter.reportStream !== undefined) {
    const stream: NodeJS.ReadableStream = reportStream(reporter as StreamReporter, processCovs)
      .pipe(proc.stdout);
    tasks.push(asyncDonePromise(() => stream));
  }
  if (reporter.reportStream !== undefined) {
    const stream: NodeJS.ReadableStream = reportVinyl(reporter as VinylReporter, processCovs)
      .pipe(vinylFs.dest(config.coverageDir));
    tasks.push(asyncDonePromise(() => stream));
  }

  try {
    await Promise.all(tasks);
    return 0;
  } catch (err) {
    proc.stderr.write(Buffer.from(err.toString() + "\n"));
    return 1;
  }
}

export async function getAction(args: string[], cwd: string): Promise<CliAction> {
  const action: ParseArgsResult = parseArgs(args);
  if (action.action !== "run") {
    return action;
  }
  const fileConfig: FileConfig = await readConfigFile(cwd);
  return {action: "run", config: resolveConfig(fileConfig, action.config)};
}

export function parseArgs(args: string[]): ParseArgsResult {
  // The yargs pure API is kinda strange to use (apart from requiring a callback):
  // The error can either be defined, `undefined` or `null`.
  // If it is defined or `null`, then `output` should be a non-empty string
  // intended to be written to stderr. `parsed` is defined but it should be
  // ignored in this case.
  // If `err` is `undefined`, then `output` is an empty string and `parsed`
  // contains the succesfully parsed args.
  // tslint:disable:variable-name
  let _err: Error | undefined | null;
  let _parsed: any;
  let _output: string;
  let isParsed: boolean = false;
  ARG_PARSER.parse(args, (err: Error | undefined | null, parsed: any, output: string): void => {
    _err = err;
    _parsed = parsed;
    _output = output;
    isParsed = true;
  });
  assert(isParsed);
  const err: Error | undefined | null = _err!;
  const parsed = _parsed!;
  const output: string = _output!;
  if (err === null) {
    // Successfully parsed
    return {
      action: "run",
      config: {
        command: parsed._,
        reporters: [parsed.reporter],
        exclude: parsed.exclude,
        include: parsed.include,
      },
    };
  } else {
    return {action: "message", message: output, error: err};
  }
}

async function readConfigFile(cwd: string): Promise<FileConfig> {
  const configPath: string | null = findUp.sync([".c8rc", ".c8rc.json"]);
  if (configPath === null) {
    return Object.create(null);
  }
  return JSON.parse(fs.readFileSync(configPath, "UTF-8"));
}
