import asyncDone from "async-done";

export async function asyncDonePromise<T>(task: asyncDone.AsyncTask<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    asyncDone(task, (err: Error | null, res?: T): void => {
      // TODO: normalize lack of error to `null` (streams return `undefined`)
      if (err) {
        reject(err);
      } else {
        resolve(res!);
      }
    });
  });
}
