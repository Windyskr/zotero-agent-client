export class NdjsonDecoder {
  private buffer = "";

  push(chunk: string): unknown[] {
    this.buffer += chunk;
    const messages: unknown[] = [];

    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline === -1) {
        break;
      }

      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);

      if (!line) {
        continue;
      }

      messages.push(JSON.parse(line));
    }

    return messages;
  }

  flush(): unknown[] {
    const line = this.buffer.trim();
    this.buffer = "";
    return line ? [JSON.parse(line)] : [];
  }
}

export function encodeNdjson(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}
