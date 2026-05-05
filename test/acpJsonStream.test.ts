import { assert } from "chai";
import {
  extractJsonMessagesFromBuffer,
  findJsonBoundary,
} from "../src/modules/acpJsonStream";

describe("ACP JSON stream parser", function () {
  it("extracts complete adjacent JSON-RPC objects", function () {
    const first = '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}';
    const second =
      '{"jsonrpc":"2.0","method":"session/update","params":{"items":[{"text":"}"}]}}';
    const result = extractJsonMessagesFromBuffer(`noise\n${first}${second}`);

    assert.deepEqual(result.messages, [first, second]);
    assert.equal(result.rest, "");
    assert.deepEqual(result.ignoredPrefixes, ["noise"]);
  });

  it("keeps incomplete objects in the buffer", function () {
    const partial = '{"jsonrpc":"2.0","id":1,"result":{"items":[1,2]}';
    const result = extractJsonMessagesFromBuffer(partial);

    assert.deepEqual(result.messages, []);
    assert.equal(result.rest, partial);
    assert.deepEqual(result.ignoredPrefixes, []);
  });

  it("ignores invalid JSON starts and resumes at the next object", function () {
    const valid = '{"jsonrpc":"2.0","id":2,"result":null}';
    const result = extractJsonMessagesFromBuffer(`{]${valid}`);

    assert.deepEqual(result.messages, [valid]);
    assert.equal(result.rest, "");
  });

  it("bounds ignored non-JSON prefixes before returning them", function () {
    const valid = '{"jsonrpc":"2.0","id":2,"result":null}';
    const result = extractJsonMessagesFromBuffer(`${"x".repeat(250)}${valid}`);

    assert.deepEqual(result.messages, [valid]);
    assert.deepEqual(result.ignoredPrefixes, [`${"x".repeat(200)}...`]);
  });

  it("handles nested arrays and escaped quotes inside strings", function () {
    const input =
      '{"params":{"command":["echo","a \\"quoted\\" brace }"],"nested":[{"ok":true}]}}';

    assert.equal(findJsonBoundary(input), input.length - 1);
  });
});
