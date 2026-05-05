export interface JsonStreamExtraction {
  messages: string[];
  rest: string;
  ignoredPrefixes: string[];
}

const MAX_IGNORED_PREFIX_LENGTH = 200;

export function extractJsonMessagesFromBuffer(
  buffer: string,
): JsonStreamExtraction {
  const messages: string[] = [];
  const ignoredPrefixes: string[] = [];
  let rest = buffer;

  while (rest.length) {
    const start = findFirstJsonStart(rest);
    if (start < 0) {
      appendIgnoredPrefix(ignoredPrefixes, rest);
      return { messages, rest: "", ignoredPrefixes };
    }

    appendIgnoredPrefix(ignoredPrefixes, rest.slice(0, start));
    rest = rest.slice(start);

    const end = findJsonBoundary(rest);
    if (end < 0) {
      return { messages, rest, ignoredPrefixes };
    }
    if (end === 0) {
      rest = rest.slice(1);
      continue;
    }

    messages.push(rest.slice(0, end + 1));
    rest = rest.slice(end + 1);
  }

  return { messages, rest, ignoredPrefixes };
}

function appendIgnoredPrefix(ignoredPrefixes: string[], prefix: string): void {
  const trimmed = prefix.trim();
  if (!trimmed) return;
  ignoredPrefixes.push(
    trimmed.length > MAX_IGNORED_PREFIX_LENGTH
      ? `${trimmed.slice(0, MAX_IGNORED_PREFIX_LENGTH)}...`
      : trimmed,
  );
}

function findFirstJsonStart(input: string): number {
  // JSON-RPC over stdio emits object messages; batch frames are not used here.
  return input.indexOf("{");
}

export function findJsonBoundary(input: string): number {
  if (!input.length) return -1;
  if (input[0] !== "{") return 0;

  const stack: string[] = ["}"];
  let inString = false;
  let escaped = false;

  for (let i = 1; i < input.length; i++) {
    const char = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = stack[stack.length - 1];
      if (char !== expected) {
        return 0;
      }
      stack.pop();
      if (!stack.length) {
        return i;
      }
    }
  }

  return -1;
}
