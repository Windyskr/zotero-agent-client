import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await mkdir("build", { recursive: true });
const result = spawnSync("zip", ["-r", "../build/zotero-acp-sidebar-chat-0.1.0.xpi", "."], {
  cwd: "dist",
  stdio: "inherit"
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
