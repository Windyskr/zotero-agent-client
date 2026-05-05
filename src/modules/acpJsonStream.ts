export interface JsonStreamExtraction {
  messages: string[];
  rest: string;
  ignoredPrefixes: string[];
}

export function extractJsonMessagesFromBuffer(
  buffer: string,
): JsonStreamExtraction {
  const messages: string[] = [];
  const ignoredPrefixes: string[] = [];
  let rest = buffer;

  while (rest.length) {
    const start = findFirstJsonStart(rest);
    if (start < 0) {
      if (rest.trim()) ignoredPrefixes.push(rest.trim());
      return { messages, rest: "", ignoredPrefixes };
    }

    const prefix = rest.slice(0, start).trim();
    if (prefix) ignoredPrefixes.push(prefix);
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
