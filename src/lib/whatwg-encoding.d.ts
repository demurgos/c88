declare module "whatwg-encoding" {
  namespace whatwgEncoding {
    export function isSupported(name: string): boolean;

    export function getBOMEncoding(buffer: Buffer): "UTF-8" | "UTF-16BE" | "UTF-16LE" | null;

    export function labelToName(label: string): string | null;

    export function decode(buffer: Buffer, encoding: string): string;
  }

  export = whatwgEncoding;
}
