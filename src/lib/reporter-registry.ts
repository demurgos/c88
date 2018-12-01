import { Reporter } from "./reporter";
import { createHtmlReporter } from "./reporters/html";
import { createLcovFileReporter, createLcovReporter } from "./reporters/lcov";
import { createTextFileReporter, createTextReporter } from "./reporters/text";

export type ReporterFactory = (options: any) => Reporter;

export class ReporterRegistry {
  private readonly registry: Map<string, ReporterFactory>;

  constructor() {
    this.registry = new Map();
  }

  public register(id: string, factory: ReporterFactory): void {
    this.registry.set(id, factory);
  }

  public create(id: string, options: any): Reporter {
    const factory: ReporterFactory | undefined = this.registry.get(id);
    if (factory === undefined) {
      throw new Error(`Unknown reporter ${id}, available: ${[...this.registry.keys()].join(", ")}`);
    }
    return factory(options);
  }
}

export const DEFAULT_REGISTRY: ReporterRegistry = new ReporterRegistry();

DEFAULT_REGISTRY.register("text", createTextReporter);
DEFAULT_REGISTRY.register("text-file", createTextFileReporter);
DEFAULT_REGISTRY.register("lcov", createLcovReporter);
// TODO: Deprecate `lcovonly`
DEFAULT_REGISTRY.register("lcovonly", createLcovFileReporter);
DEFAULT_REGISTRY.register("lcov-file", createLcovFileReporter);
DEFAULT_REGISTRY.register("html", createHtmlReporter);
