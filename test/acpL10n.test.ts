import { assert } from "chai";
import { formatPlainTemplate } from "../src/modules/acpL10n";

describe("ACP localization fallback", function () {
  it("formats simple named placeholders", function () {
    assert.equal(
      formatPlainTemplate("Stopped: {reason}", { reason: "cancelled" }),
      "Stopped: cancelled",
    );
  });

  it("leaves unknown placeholders intact", function () {
    assert.equal(
      formatPlainTemplate("{known} {missing}", { known: "yes" }),
      "yes {missing}",
    );
  });

  it("formats nullish known values as empty strings", function () {
    assert.equal(formatPlainTemplate("File: {name}", { name: null }), "File: ");
  });
});
