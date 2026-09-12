import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/app.ts"],
  format: ["esm"],
  target: "esnext",
  outDir: "dist",
  clean: true,
  bundle: true,
  splitting: false,
  dts: false,
  // Let Cloudflare's nodejs_compat provide these at runtime
  external: [/^node:/],
});