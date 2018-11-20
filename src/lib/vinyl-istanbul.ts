import from2 from "from2";
import libReport from "istanbul-lib-report";
import Vinyl from "vinyl";
import sysPath from "path";
import fs from "fs";

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

  public writeFile(file: string | null): ConsoleContentWriter | VinylContentWriter {
    if (file === null) {
      // file = "coverage.txt";
      return new ConsoleContentWriter();
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

class ConsoleContentWriter implements libReport.ContentWriter {
  constructor() {
  }

  public write(str: string): void {
    process.stdout.write(str);
  }

  public println(str: string) {
    this.write(str);
    this.write("\n");
  }

  public colorize(str: string): string {
    return str;
  }

  public close(): void {
  }
}

export function vinylReport(covMap: any, reporter: any, sourceFinder?: (filepath: string) => string): NodeJS.ReadableStream {
  let done: boolean = false;
  return from2({objectMode: true}, (_: number, next: (err: null | Error, obj: Vinyl) => void): void => {
    if (done) {
      next(null, null as any); // end of stream
      return;
    }
    const cwd: string = process.cwd();
    const writer: VinylWriter = new VinylWriter(cwd, cwd, next);
    // TODO: Fix istanbul-lib-report types
    const context: libReport.Context = createContext({writer, sourceFinder} as any as ContextOptions);
    const tree: libReport.Tree = libReport.summarizers.pkg(covMap);
    tree.visit(reporter, context);
    done = true;
    next(null, null as any); // end of stream
  });
}
