/// <reference lib="webworker" />
import { parseSpreadsheetBuffer } from "./importers";

self.onmessage = (e: MessageEvent<{ buf: ArrayBuffer; fileName: string }>) => {
  self.postMessage({ type: "start" });
  try {
    const result = parseSpreadsheetBuffer(e.data.buf, e.data.fileName, (done, total, sheet) => self.postMessage({ type: "progress", done, total, sheet }));
    self.postMessage({ type: "done", result });
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
