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
  entryPoints: ["src/index.ts"],
  outfile: "dist/chrome/content/scripts/acpchat.js",
  globalName: "ZoteroAcpChat"
});

await esbuild.build({
  ...shared,
  entryPoints: ["src/preferences.ts"],
  outfile: "dist/chrome/content/preferences.js",
  globalName: "ZoteroAcpChatPreferences"
});
