import { assert } from "chai";
import type { SessionConfigOption } from "../src/modules/acpChatTypes";
import {
  attachmentTypeLabel,
  compactSelectStyle,
  formatMessageTime,
  getMessageStatusLabel,
  getRoleLabel,
  pickConfigOption,
} from "../src/modules/acpChatViewFormatting";

describe("ACP chat view formatting", function () {
  it("formats attachment type labels from extensions", function () {
    assert.equal(attachmentTypeLabel("paper.pdf"), "PDF");
    assert.equal(attachmentTypeLabel("archive.longext"), "FILE");
    assert.equal(attachmentTypeLabel("README"), "FILE");
    assert.equal(attachmentTypeLabel(".env"), "FILE");
  });

  it("picks config options by category before id", function () {
    const modelById = option("model", undefined);
    const modelByCategory = option("custom-model", "model");

    assert.equal(
      pickConfigOption([modelById, modelByCategory], "model"),
      modelByCategory,
    );
    assert.equal(pickConfigOption([modelById], "MODEL"), modelById);
    assert.isNull(pickConfigOption([], "model"));
  });

  it("calculates compact select text width", function () {
    assert.deepEqual(compactSelectStyle(option("model", "model", "gpt")), {
      "--acpchat-select-text-width": "3ch",
    });
    assert.deepEqual(compactSelectStyle(option("model", "model", "深度")), {
      "--acpchat-select-text-width": "4ch",
    });
    assert.deepEqual(
      compactSelectStyle(option("model", "model", "very-long-model-name")),
      {
        "--acpchat-select-text-width": "18ch",
      },
    );
  });

  it("uses localization fallbacks for role and status labels", function () {
    assert.equal(getRoleLabel("assistant", l10n), "Agent");
    assert.equal(getMessageStatusLabel("cancelled", l10n), "Cancelled");
  });

  it("returns an empty time label for invalid dates", function () {
    assert.equal(formatMessageTime("not-a-date"), "");
  });
});

function l10n(_id: string, fallback: string): string {
  return fallback;
}

function option(
  id: string,
  category?: string,
  currentValue = "current",
): SessionConfigOption {
  return {
    id,
    name: id,
    category,
    type: "select",
    currentValue,
    options: [
      {
        value: currentValue,
        name: currentValue,
      },
    ],
  };
}
