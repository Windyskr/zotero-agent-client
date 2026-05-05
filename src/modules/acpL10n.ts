import { config } from "../../package.json";

interface FluentPattern {
  value: string | null;
  attributes: Array<{ name: string; value: string }> | null;
}

interface LocalizationBundle {
  formatMessagesSync(
    messages: Array<{ id: string; args?: Record<string, unknown> }>,
  ): FluentPattern[];
}

interface LocalizationConstructor {
  new (resourceIds: string[], generateBundles: boolean): LocalizationBundle;
}

let mainWindowL10n: LocalizationBundle | null = null;

export function getMainWindowString(
  id: string,
  fallback: string,
  args?: Record<string, unknown>,
): string {
  try {
    if (!mainWindowL10n) {
      const LocalizationCtor = getLocalizationConstructor();
      mainWindowL10n = new LocalizationCtor(
        [`${config.addonRef}-mainWindow.ftl`],
        true,
      );
    }
    const pattern = mainWindowL10n.formatMessagesSync([
      { id: `${config.addonRef}-${id}`, args },
    ])[0] as FluentPattern | undefined;
    return pattern?.value || formatPlainTemplate(fallback, args);
  } catch {
    return formatPlainTemplate(fallback, args);
  }
}

export function formatPlainTemplate(
  template: string,
  args?: Record<string, unknown>,
): string {
  if (!args) return template;
  return template.replace(/\{\s*\$?(\w+)\s*\}/g, (match, key) =>
    Object.hasOwn(args, key) ? formatPlainValue(args[key]) : match,
  );
}

function formatPlainValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return "";
}

function getLocalizationConstructor(): LocalizationConstructor {
  return (
    typeof Localization === "undefined"
      ? ztoolkit.getGlobal("Localization")
      : Localization
  ) as LocalizationConstructor;
}
