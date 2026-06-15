import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  target: "node18",
  dts: { entry: "src/index.ts" },
  sourcemap: true,
  clean: true,
  splitting: false,
  // cli.ts carries its own shebang; esbuild preserves it on the entry
  shims: true,
});
