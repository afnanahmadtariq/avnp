import { describe, expect, it } from "vitest";

import { evidencePointLabel, evidenceSupportCopy } from "./evidence";

describe("evidence copy", () => {
  it("uses singular grammar for one evidence point", () => {
    expect(evidencePointLabel(1, { verified: true })).toBe(
      "1 verified evidence point",
    );
    expect(evidenceSupportCopy(1, "this offer")).toBe(
      "1 evidence point supports this offer",
    );
  });

  it("uses plural grammar for zero or multiple evidence points", () => {
    expect(evidencePointLabel(0)).toBe("0 evidence points");
    expect(evidenceSupportCopy(3, "the terms", { verified: true })).toBe(
      "3 verified evidence points support the terms",
    );
  });
});
