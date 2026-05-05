import MarkdownIt from "markdown-it";

const SAFE_LINK_PROTOCOLS = new Set(["http", "https", "mailto"]);

export function createMarkdownRenderer(): MarkdownIt {
  const markdown = new MarkdownIt({
    breaks: true,
    html: false,
    linkify: true,
    typographer: false,
    xhtmlOut: true,
  });
  markdown.validateLink = isSafeMarkdownLink;

  const renderMarkdownLink =
    markdown.renderer.rules.link_open ??
    ((tokens, index, options, _env, self) =>
      self.renderToken(tokens, index, options));
  markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const href = tokens[index].attrGet("href") ?? "";
    if (isExternalMarkdownLink(href)) {
      tokens[index].attrSet("target", "_blank");
      tokens[index].attrSet("rel", "noopener noreferrer");
    }
    return renderMarkdownLink(tokens, index, options, env, self);
  };

  return markdown;
}

function isExternalMarkdownLink(url: string): boolean {
  const compact = stripAsciiControlsAndSpaces(url.trim());
  const match = compact.match(/^([a-z][a-z0-9+.-]*):/i);
  return !!match && SAFE_LINK_PROTOCOLS.has(match[1].toLowerCase());
}

export function isSafeMarkdownLink(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#")) return true;
  if (trimmed.startsWith("//")) return false;

  const compact = stripAsciiControlsAndSpaces(trimmed);
  const match = compact.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!match) return false;

  return SAFE_LINK_PROTOCOLS.has(match[1].toLowerCase());
}

function stripAsciiControlsAndSpaces(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 32 && code !== 127;
    })
    .join("");
}
