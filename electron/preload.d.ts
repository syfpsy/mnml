import type { MnmlApi } from "./preload";

declare global {
  interface Window {
    mnml: MnmlApi;
  }
}

export {};
