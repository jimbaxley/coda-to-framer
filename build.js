const esbuild = require("esbuild");

esbuild.build({
  entryPoints: ["src/pack.ts"],
  bundle: true,
  outfile: "build/pack.js",
  format: "cjs",
  target: "es2022",
  sourcemap: false,
  external: ["@codahq/packs-sdk"],
});
