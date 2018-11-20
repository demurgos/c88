import from2 from "from2";
import fs from "fs";
import libReport from "istanbul-lib-report";
import sysPath from "path";
import stream from "stream";
import Vinyl from "vinyl";
import { ReportOptions, StreamReporter, VinylReporter } from "./reporter";

export interface ContextOptions extends libReport.Context {
  writer: libReport.FileWriter;
}

function createContext(options: ContextOptions): any {
  const context: libReport.Context = libReport.createContext(options);
  if (context.writer !== options.writer) {
    Object.defineProperty(context, "writer", {value: options.writer});
  }
  return context;
}

export function wrapFileReporter(reporter: libReport.Visitor): VinylReporter {
  function reportVinyl(options: Readonly<ReportOptions>): NodeJS.ReadableStream {
    let done: boolean = false;
    return from2({objectMode: true}, (_: number, next: (err: null | Error, obj: Vinyl) => void): void => {
      if (done) {
        next(null, null as any); // end of stream
        return;
      }
      const cwd: string = process.cwd();
      const writer: VinylWriter = new VinylWriter(cwd, cwd, next);
      // TODO: Fix istanbul-lib-report types
      const context: libReport.Context = createContext({
        writer,
        sourceFinder: options.sourceFinder,
      } as any as ContextOptions);
      const tree: libReport.Tree = libReport.summarizers.pkg(options.map);
      tree.visit(reporter, context);
      done = true;
    });
  }

  return {reportVinyl};
}

class VinylWriter implements libReport.FileWriter {
  public readonly base: string;
  public readonly dir: string;
  private readonly next: (err: null | Error, obj: Vinyl) => void;

  constructor(base: string, dir: string, next: (err: null | Error, obj: Vinyl) => void) {
    this.base = base;
    this.dir = dir;
    this.next = next;
  }

  public copyFile(source: string, dest: string): void {
    const content: Buffer = fs.readFileSync(source);
    const resolvedPath: string = sysPath.join(this.dir, dest);
    const vinyl: Vinyl = new Vinyl({
      cwd: this.base,
      base: this.base,
      path: resolvedPath,
      contents: content,
    });
    this.next(null, vinyl);
  }

  public writeFile(file: string | null): VinylContentWriter {
    if (typeof file !== "string") {
      throw new Error("NotSupported: StreamWriter#writeFile(file: null)");
    }
    const resolvedPath: string = sysPath.join(this.dir, file);
    return new VinylContentWriter((content: Buffer): void => {
      const vinyl: Vinyl = new Vinyl({
        cwd: this.base,
        base: this.base,
        path: resolvedPath,
        contents: content,
      });
      this.next(null, vinyl);
    });
  }

  public writeForDir(subdir: string): VinylWriter {
    return new VinylWriter(this.base, sysPath.join(this.dir, subdir), this.next);
  }
}

class VinylContentWriter implements libReport.ContentWriter {
  private readonly chunks: string[];
  private readonly done: (content: Buffer) => void;

  constructor(done: (content: Buffer) => void) {
    this.chunks = [];
    this.done = done;
  }

  public write(str: string): void {
    this.chunks.push(str);
  }

  public println(str: string) {
    this.write(str);
    this.write("\n");
  }

  public colorize(str: string): string {
    return str;
  }

  public close(): void {
    return this.done(Buffer.from(this.chunks.join("")));
  }
}

export function wrapStreamReporter(reporter: libReport.Visitor): StreamReporter {
  function reportStream(options: Readonly<ReportOptions>): NodeJS.ReadableStream {
    const duplex: stream.Duplex = new stream.PassThrough();
    const writer: StreamWriter = new StreamWriter(duplex);
    const context: libReport.Context = createContext({
      writer,
      sourceFinder: options.sourceFinder,
    } as any as ContextOptions);
    const tree: libReport.Tree = libReport.summarizers.pkg(options.map);
    tree.visit(reporter, context);
    return duplex;
  }

  return {reportStream};
}

class StreamWriter implements libReport.FileWriter {
  private readonly stream: NodeJS.WritableStream;
  private fileName: string | null | undefined;

  constructor(stream: NodeJS.WritableStream) {
    this.stream = stream;
    this.fileName = undefined;
  }

  public copyFile(source: string, dest: string): void {
    throw new Error("NotSupported: StreamWriter#copyFile");
  }

  public writeFile(file: string | null): StreamContentWriter {
    if (typeof file !== "string") {
      file = null;
    }
    if (this.fileName === undefined) {
      this.fileName = file;
    } else if (file !== this.fileName) {
      throw new Error(`NotSupported: Write to multiple different files: ${this.fileName}, ${file}`);
    }

    return new StreamContentWriter(this.stream);
  }

  public writeForDir(subdir: string): StreamWriter {
    throw new Error("NotSupported: StreamWriter#writeForDir");
  }
}

class StreamContentWriter implements libReport.ContentWriter {
  private readonly stream: NodeJS.WritableStream;

  constructor(stream: NodeJS.WritableStream) {
    this.stream = stream;
  }

  public write(str: string): void {
    this.stream.write(Buffer.from(str));
  }

  public println(str: string) {
    this.write(str);
    this.write("\n");
  }

  public colorize(str: string): string {
    return str;
  }

  public close(): void {
    this.stream.end();
  }
}
