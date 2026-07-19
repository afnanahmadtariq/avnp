import { describe, expect, it } from "vitest";

import { RuntimeConfigService } from "./runtime-config.service.js";

describe("RuntimeConfigService", () => {
  it("exposes a safe local runtime", () => {
    const service = new RuntimeConfigService();

    expect(service.value.mode).toBe("fixture");
    expect(service.value.queue.provider).toBe("memory");
  });
});
