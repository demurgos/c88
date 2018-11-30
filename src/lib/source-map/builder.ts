import libCoverage from "istanbul-lib-coverage";
import { Position, SourceLocation } from "./index";

export class CoverageMapBuilder {
  private readonly files: Map<string, FileCoverageBuilder>;

  constructor() {
    this.files = new Map();
  }

  addStatement(url: string, loc: SourceLocation, count: number): void {
    this.getOrCreateFileCoverageBuilder(url).addStatement(loc, count);
  }

  addFunction(url: string, decl: SourceLocation, loc: SourceLocation, count: number, name: string): void {
    this.getOrCreateFileCoverageBuilder(url).addFunction(decl, loc, count, name);
  }

  addBranch(url: string, mainLoc: SourceLocation, arms: Iterable<[SourceLocation, number]>, type: string): void {
    this.getOrCreateFileCoverageBuilder(url).addBranch(mainLoc, arms, type);
  }

  build(): libCoverage.CoverageMapData {
    const data: libCoverage.CoverageMapData = Object.create(null);
    for (const [url, file] of this.files) {
      data[url] = libCoverage.createFileCoverage(file.build(url));
    }
    return data;
  }

  private getOrCreateFileCoverageBuilder(url: string): FileCoverageBuilder {
    let builder: FileCoverageBuilder | undefined = this.files.get(url);
    if (builder === undefined) {
      builder = new FileCoverageBuilder();
      this.files.set(url, builder);
    }
    return builder;
  }
}

interface Branch {
  readonly loc: SourceLocation;
  readonly arms: ReadonlyArray<BranchArm>;
  readonly type: string;
}

interface BranchArm {
  readonly loc: SourceLocation;
  count: number;
}

interface Function {
  readonly decl: SourceLocation;
  readonly loc: SourceLocation;
  name?: string;
  count: number;
}

interface Statement {
  readonly loc: SourceLocation;
  count: number;
}

export class FileCoverageBuilder {
  private readonly branches: Map<string, Branch>;
  private readonly functions: Map<string, Function>;
  private readonly statements: Map<string, Statement>;

  constructor() {
    this.branches = new Map();
    this.functions = new Map();
    this.statements = new Map();
  }

  addStatement(loc: SourceLocation, count: number): void {
    const hash: string = hashSourceLocation(loc);
    let statement: Statement | undefined = this.statements.get(hash);
    if (statement === undefined) {
      statement = {loc, count: 0};
      this.statements.set(hash, statement);
    }
    statement.count += count;
  }

  addFunction(decl: SourceLocation, loc: SourceLocation, count: number, name?: string): void {
    const hash: string = hashSourceLocation(decl);
    let func: Function | undefined = this.functions.get(hash);
    if (func === undefined) {
      func = {decl, loc, name, count: 0};
      this.functions.set(hash, func);
    }
    func.count += count;
    if (func.name === undefined) {
      func.name = name;
    }
  }

  addBranch(mainLoc: SourceLocation, arms: Iterable<[SourceLocation, number]>, type: string): void {
    const armHashes: string[] = [];
    for (const [loc, _] of arms) {
      armHashes.push(hashSourceLocation(loc));
    }
    const hash: string = `${hashSourceLocation(mainLoc)}(${armHashes.join(",")})`;
    let branch: Branch | undefined = this.branches.get(hash);
    if (branch === undefined) {
      const newArms: BranchArm[] = [];
      for (const [loc, _] of arms) {
        newArms.push({loc, count: 0});
      }
      branch = {type, loc: mainLoc, arms: newArms};
      this.branches.set(hash, branch);
    }
    let i: number = 0;
    for (const [_, count] of arms) {
      branch.arms[i].count += count;
      i++;
    }
  }

  build(url: string): libCoverage.FileCoverageData {
    const statementMap: Record<string, any> = Object.create(null);
    const s: Record<string, number> = Object.create(null);
    let sid: number = 0;
    for (const {loc, count} of this.statements.values()) {
      const key: string = `s${sid}`;
      sid++;
      statementMap[key] = loc;
      s[key] = count;
    }

    const fnMap: Record<string, any> = Object.create(null);
    const f: Record<string, number> = Object.create(null);
    let fid: number = 0;
    for (const {decl, loc, name, count} of this.functions.values()) {
      const key: string = `f${fid}`;
      fid++;
      fnMap[key] = {decl, loc, name: name === undefined ? `unknown_${key}` : name};
      f[key] = count;
    }

    const branchMap: Record<string, any> = Object.create(null);
    const b: Record<string, number[]> = Object.create(null);

    return {path: url, statementMap, s, fnMap, f, branchMap, b};
  }
}

export function hashSourceLocation(loc: SourceLocation): string {
  return `${hashPosition(loc.start)}-${hashPosition(loc.end)}`;
}

export function hashPosition(pos: Position): string {
  return `${pos.line}:${pos.column}`;
}
