import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/main": "src/cli/main.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  sourcemap: true,
  clean: true,
  dts: true,
  splitting: false,
  shims: false,
});
