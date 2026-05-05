import { toMessage } from "./acpChatUtils";

type Localize = (
  id: string,
  fallback: string,
  args?: Record<string, unknown>,
) => string;

export function renderPlainLoading(body: HTMLElement, l10n: Localize): void {
  body.textContent = "";
  const doc = body.ownerDocument!;
  const panel = doc.createElement("section");
  panel.className = "acpchat-panel";
  const card = doc.createElement("div");
  card.className = "acpchat-loading-card";
  const title = doc.createElement("div");
  title.className = "acpchat-loading-title";
  title.textContent = l10n(
    "acpchat-panel-loading-title",
    "Preparing research context",
  );
  const detail = doc.createElement("div");
  detail.className = "acpchat-loading-detail";
  detail.textContent = l10n(
    "acpchat-panel-loading-detail",
    "Looking for a local PDF attachment and recent chat state.",
  );
  card.append(title, detail);
  panel.append(card);
  body.append(panel);
}

export function renderPlainError(
  body: HTMLElement,
  error: unknown,
  l10n: Localize,
): void {
  body.textContent = "";
  const doc = body.ownerDocument!;
  const panel = doc.createElement("section");
  panel.className = "acpchat-panel";
  const card = doc.createElement("div");
  card.className = "acpchat-fatal";
  const title = doc.createElement("div");
  title.className = "acpchat-fatal-title";
  title.textContent = l10n(
    "acpchat-fatal-title",
    "Could not load Agent Client",
  );
  const detail = doc.createElement("div");
  detail.className = "acpchat-fatal-detail";
  detail.textContent = toMessage(error);
  card.append(title, detail);
  panel.append(card);
  body.append(panel);
}
