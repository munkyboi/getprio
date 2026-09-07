/// <reference types="vite/client" />

declare module "jsbarcode/dist/barcodes/JsBarcode.code128.min.js";

interface Window {
  JsBarcode: typeof import("jsbarcode").default;
}
