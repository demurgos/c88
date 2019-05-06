import assert from "assert";
import cp from "child_process";
import { CloseFn as FgCloseFn, proxy as fgChildProxy } from "demurgos-foreground-child";
import findUp from "find-up";
import fs from "fs";
import { fromSysPath, toSysPath } from "furi";
import sysPath from "path";
import Exclude from "test-exclude";
import urlMod from "url";
import vinylFs from "vinyl-fs";
import yargs from "yargs";
import { asyncDonePromise } from "./async-done-promise";
import { CoverageFilter, fromGlob } from "./filter";
import { GetText, getText as defaultGetText, GetTextSync, getTextSyncFromSourceStore } from "./get-text";
import { createReporter, reportStream, reportVinyl } from "./report";
import { Reporter, StreamReporter, VinylReporter } from "./reporter";
import { DEFAULT_REGISTRY } from "./reporter-registry";
import { RichProcessCov, spawnInspected } from "./spawn-inspected";
import { processCovsToIstanbul } from "./to-istanbul";
import { VERSION } from "./version";

const DEFAULT_GLOBS: ReadonlyArray<string> = [
  ...(<string[]> Exclude.defaultExclude.map((pattern: string) => `!${pattern}`)),
  "**/*",
];

interface Watermarks {
  lines: [number, number];
  functions: [number, number];
  branches: [number, number];
  statements: [number, number];
}

export interface FileConfig {
  reporters?: ReadonlyArray<string>;
  globs?: ReadonlyArray<string>;
  coverageDir?: string;
  waterMarks?: Watermarks;
}

export interface CliConfig {
  reporters?: ReadonlyArray<string>;
  globs?: ReadonlyArray<string>;
  coverageDir?: string;
  command: ReadonlyArray<string>;
}

export interface ResolvedConfig {
  reporters: ReadonlyArray<string>;
  globs: ReadonlyArray<string>;
  coverageDir: string;
  waterMarks: Watermarks;
  command: ReadonlyArray<string>;
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
  .scriptName("c88")
  .version(VERSION)
  .usage("$0 [opts] [script] [opts]")
  .locale("en")
  .option("reporter", {
    alias: "r",
    describe: "coverage reporter(s) to use",
    default: "text",
  })
  .option("match", {
    alias: "m",
    default: DEFAULT_GLOBS,
    // tslint:disable-next-line:max-line-length
    describe: "a list of specific files and directories that should be matched, glob patterns are supported.",
  })
  .option("coverage-directory", {
    default: "coverage",
    describe: "directory to output coverage JSON and reports",
  })
  .pkgConf("c88")
  .demandCommand(1)
  .epilog("visit https://git.io/vHysA for list of available reporters");

// tslint:disable:whitespace

/**
 * Executes the c88 CLI
 *
 * @param args CLI arguments
 * @param cwd Current working directory
 * @param proc Current process
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
    globs: cliConfig.globs !== undefined ? cliConfig.globs : DEFAULT_GLOBS,
    waterMarks: fileConfig.waterMarks !== undefined ? fileConfig.waterMarks : DEFAULT_WATERMARKS,
    coverageDir: cliConfig.coverageDir !== undefined ? cliConfig.coverageDir : "coverage",
  };
}

async function execRunAction({config}: RunAction, cwd: string, proc: NodeJS.Process): Promise<number> {
  const file: string = config.command[0];
  const args: string[] = config.command.slice(1);
  const filter: CoverageFilter = fromGlob({patterns: config.globs, base: fromSysPath(cwd)});

  const subProcessExit: DeferredPromise<number> = deferPromise();

  async function onRootProcess(inspectedProc: cp.ChildProcess): Promise<void> {
    const closeFn: FgCloseFn = await fgChildProxy(proc, inspectedProc);
    if (closeFn.signal !== null) {
      subProcessExit.reject(new Error(`Process killed by signal: ${closeFn.signal}`));
    } else {
      subProcessExit.resolve(closeFn.code!);
    }
  }

  let processCovs: RichProcessCov[];
  try {
    processCovs = await spawnInspected(file, args, {filter, onRootProcess});
  } catch (err) {
    proc.stderr.write(Buffer.from(`${err.toString()}\n`));
    return 1;
  }
  const exitCode: number = await subProcessExit.promise;

  try {
    const reporter: Reporter = createReporter(DEFAULT_REGISTRY, config.reporters, {waterMarks: config.waterMarks});
    const resolvedCoverageDir: string = sysPath.join(cwd, config.coverageDir);
    const coverageDir: urlMod.URL = fromSysPath(resolvedCoverageDir);
    await report(reporter, processCovs, proc.stdout, coverageDir);
    return exitCode;
  } catch (err) {
    proc.stderr.write(Buffer.from(err.toString() + "\n"));
    return Math.max(1, exitCode);
  }
}

export async function report(
  reporter: Reporter,
  processCovs: ReadonlyArray<RichProcessCov>,
  outStream: NodeJS.WritableStream,
  outDir: Readonly<urlMod.URL>,
  getText: GetText = defaultGetText,
): Promise<void> {
  const {coverageMap, sources} = await processCovsToIstanbul(processCovs, getText);
  const getSourcesSync: GetTextSync = getTextSyncFromSourceStore(sources);

  const tasks: Promise<void>[] = [];
  if (reporter.reportStream !== undefined) {
    const stream: NodeJS.ReadableStream = reportStream(reporter as StreamReporter, coverageMap, getSourcesSync);
    tasks.push(pipeData(stream, outStream));
  }
  if (reporter.reportVinyl !== undefined) {
    const stream: NodeJS.ReadableStream = reportVinyl(reporter as VinylReporter, coverageMap, getSourcesSync)
      .pipe(vinylFs.dest(toSysPath(outDir.href)));
    tasks.push(asyncDonePromise(() => stream));
  }

  await Promise.all(tasks);
}

export async function getAction(args: string[], cwd: string): Promise<CliAction> {
  const parsed: ParseArgsResult = parseArgs(args);
  if (parsed.action !== "run") {
    return parsed;
  }
  const fileConfig: FileConfig = await readConfigFile(cwd);
  return {
    action: "run",
    config: resolveConfig(fileConfig, parsed.config),
  };
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
  const parsed: any = _parsed!;
  const output: string = _output!;
  if (err === null) {
    // Successfully parsed
    return {
      action: "run",
      config: {
        command: parsed._,
        reporters: Array.isArray(parsed.reporter) ? parsed.reporter : [parsed.reporter],
        globs: parsed.match,
      },
    };
  } else {
    return {action: "message", message: output, error: err};
  }
}

async function readConfigFile(_cwd: string): Promise<FileConfig> {
  const configPath: string | null = findUp.sync([".c88rc", ".c88rc.json"]);
  if (configPath === null) {
    return Object.create(null);
  }
  return JSON.parse(fs.readFileSync(configPath, "UTF-8"));
}

interface DeferredPromise<T> {
  promise: Promise<T>;

  resolve(value: T): void;

  reject(reason: any): void;
}

function deferPromise<T>(): DeferredPromise<T> {
  let resolve: (value: T) => void;
  let reject: (reason: any) => void;
  const promise: Promise<T> = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {resolve: resolve!, reject: reject!, promise};
}

function pipeData(src: NodeJS.ReadableStream, dest: NodeJS.WritableStream): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    src.on("data", chunk => dest.write(chunk));
    src.on("error", reject);
    src.on("end", resolve);
  });
}
