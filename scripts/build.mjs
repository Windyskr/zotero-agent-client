import esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("addon", "dist", { recursive: true });

const shared = {
  bundle: true,
  target: "firefox115",
  format: "iife",
  sourcemap: true,
  logLevel: "info"
};

await esbuild.build({
  ...shared,
  entryPoints: ["src/bootstrap.ts"],
  outfile: "dist/bootstrap.js",
  globalName: "ZoteroAcpChatBootstrap"
});

await esbuild.build({
  ...shared,
  entryPoints: ["src/preferences.ts"],
  outfile: "dist/content/preferences.js",
  globalName: "ZoteroAcpChatPreferences"
});
