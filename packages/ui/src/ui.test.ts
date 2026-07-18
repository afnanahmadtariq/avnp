import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buttonClassName,
  classNames,
  kpiClassName,
  relayCssVariables,
  relayTokenReference,
  relayTokens,
  statusClassName,
  workflowMarkerClassName,
} from "./index.js";

import type { RelayTokenName } from "./index.js";

describe("Relay design tokens", () => {
  it("keeps the TypeScript and CSS token contracts synchronized", () => {
    const styles = readFileSync(
      new URL("./styles.css", import.meta.url),
      "utf8",
    );
    const normalizedStyles = styles.replaceAll(/\s+/g, " ");

    for (const token of Object.keys(relayTokens) as RelayTokenName[]) {
      const declaration = `${relayCssVariables[token]}: ${relayTokens[token]};`
        .replaceAll(/\s+/g, " ")
        .trim();

      expect(normalizedStyles).toContain(declaration);
    }

    expect(relayTokenReference("accent")).toBe("var(--relay-accent)");
  });
});

describe("framework-neutral class helpers", () => {
  it("normalizes optional utility classes deterministically", () => {
    expect(classNames(" relay-card ", false, null, "space-y-4  lg:p-8")).toBe(
      "relay-card space-y-4 lg:p-8",
    );
  });

  it("builds stable component class contracts without rendering a framework", () => {
    expect(buttonClassName()).toBe("relay-button relay-button--primary");
    expect(buttonClassName("secondary", "w-full")).toBe(
      "relay-button relay-button--secondary w-full",
    );
    expect(kpiClassName("positive")).toBe("relay-kpi relay-kpi--positive");
    expect(statusClassName("active")).toBe("relay-status relay-status--active");
    expect(workflowMarkerClassName("current")).toBe(
      "relay-workflow__marker relay-workflow__marker--current",
    );
  });
});
