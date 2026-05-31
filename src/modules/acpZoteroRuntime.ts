export function getZoteroProfileDir(): string {
  const zotero = Zotero as unknown as { Profile?: { dir?: unknown } };
  return typeof zotero.Profile?.dir === "string" ? zotero.Profile.dir : "";
}

export function getRuntimeHomeDir(): string {
  if (typeof PathUtils !== "undefined") {
    const pathUtils = PathUtils as unknown as { homeDir?: unknown };
    if (typeof pathUtils.homeDir === "string" && pathUtils.homeDir) {
      return pathUtils.homeDir;
    }
  }

  const envHome = getServiceEnvironmentValue("HOME", "USERPROFILE");
  if (envHome) return envHome;

  try {
    if (typeof Zotero === "undefined") return "";
    return deriveHomeFromProfileDir(getZoteroProfileDir());
  } catch {
    return "";
  }
}

export function getServiceEnvironmentValue(...names: string[]): string {
  if (typeof Services === "undefined") return "";
  const candidates = new Set<string>();
  for (const name of names) {
    candidates.add(name);
    candidates.add(name.toUpperCase());
    candidates.add(name.toLowerCase());
  }
  for (const name of candidates) {
    const value = Services.env.get(name);
    if (value) return value;
  }
  return "";
}

export function deriveHomeFromProfileDir(profileDir: string): string {
  if (!profileDir) return "";
  const normalized = profileDir.replace(/\\/g, "/");
  const markers = [
    "/Library/Application Support/Zotero/",
    "/.zotero/",
    "/AppData/",
  ];
  for (const marker of markers) {
    const index = normalized.indexOf(marker);
    if (index > 0) {
      return normalized.slice(0, index);
    }
  }
  return "";
}
