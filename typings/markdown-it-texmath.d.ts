declare module "markdown-it-texmath" {
  import type MarkdownIt from "markdown-it";
  import type { KatexOptions } from "katex";

  interface MarkdownItTexmathOptions {
    delimiters?: string | string[];
    engine?: unknown;
    katexOptions?: KatexOptions;
    outerSpace?: boolean;
    macros?: Record<string, string>;
  }

  const texmath: MarkdownIt.PluginWithOptions<MarkdownItTexmathOptions>;
  export default texmath;
}
