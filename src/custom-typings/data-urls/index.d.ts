declare module "data-urls" {
  import MIMEType from "whatwg-mimetype";
  import { URLRecord } from "whatwg-url";

  function dataUrls(url: string): dataUrls.DataURL | null;

  namespace dataUrls {
    export interface DataURL {
      mimeType: MIMEType;
      body: Buffer;
    }

    export function fromURLRecord(url: URLRecord): DataURL | null;
  }

  export = dataUrls;
}
