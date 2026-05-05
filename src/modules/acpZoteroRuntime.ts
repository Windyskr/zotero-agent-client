export function getZoteroProfileDir(): string {
  const zotero = Zotero as unknown as { Profile?: { dir?: unknown } };
  return typeof zotero.Profile?.dir === "string" ? zotero.Profile.dir : "";
}
