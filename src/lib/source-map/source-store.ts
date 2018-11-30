/**
 * Represents source text that can be missing.
 */
export type NullableSourceText = string | null;

export interface SourceStore {
  /**
   * Registers a `url`, optionally with its source text.
   *
   * @param url URL of the source text.
   * @param sourceText Source text corresponding to the provided URL, or `null`.
   * @returns Boolean indicating if the source store was updated.
   */
  set(url: string, sourceText: NullableSourceText): boolean;

  // TODO: Find out why TSLint complains about whitespace
  // tslint:disable:whitespace
  /**
   * Returns the current source text for the provided `url`.
   *
   * - If the `url` is unknown, returns `undefined`.
   * - If the `url` is known but does not have any associated source text,
   *   returns `null`.
   * - If the `url` is known and the store has its source text, returns the
   *   source text (a `string`).
   *
   * @param url URL of the source text.
   */
  get(url: string): NullableSourceText | undefined;

  // tslint:enable

  [Symbol.iterator](): Iterator<[string, NullableSourceText]>;
}

/**
 * This is basically a `Map` with a setter checking for changes instead
 * of returning `this`.
 */
export class MemorySourceStore implements SourceStore {
  private readonly urlToSourceText: Map<string, NullableSourceText>;

  constructor(initialData?: Iterable<[string, NullableSourceText]>) {
    this.urlToSourceText = initialData === undefined ? new Map() : new Map(initialData);
  }

  /**
   * Registers a `url`, optionally with its source text.
   *
   * Throws an error if the URL is already set and the value differs.
   *
   * @param url URL to set.
   * @param sourceText Source text corresponding to the provided URL.
   * @returns Boolean indicating if the source store was updated.
   */
  set(url: string, sourceText: NullableSourceText): boolean {
    const old: NullableSourceText | undefined = this.urlToSourceText.get(url);
    if (old === undefined || old === null) {
      this.urlToSourceText.set(url, sourceText);
    } else if (sourceText !== null && sourceText !== old) {
      throw new Error(`Incompatible sources for URL: ${url}\nold: ${old}\nnew: ${sourceText}`);
    }
    return sourceText !== old;
  }

  get(url: string): NullableSourceText | undefined {
    return this.urlToSourceText.get(url);
  }

  [Symbol.iterator](): Iterator<[string, NullableSourceText]> {
    return this.urlToSourceText[Symbol.iterator]();
  }
}
