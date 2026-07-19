import type { ApiInventoryItem, JobSpecification } from "~/types/api";

export interface MovingBriefInput {
  access: string;
  budget: string;
  destination: string;
  flexibility: string;
  homeSize: string;
  inventory: string;
  moveDate: string;
  origin: string;
}

function bedroomsFromHomeSize(homeSize: string): number {
  if (/studio/i.test(homeSize)) return 0;

  const match = homeSize.match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

function inventoryFromSummary(summary: string): ApiInventoryItem[] {
  const items = summary
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const quantityMatch = item.match(/^(\d+)\s+(.+)$/);

      return {
        name: quantityMatch?.[2]?.trim() ?? item,
        quantity: quantityMatch ? Number(quantityMatch[1]) : 1,
      };
    });

  return items.length > 0 ? items : [{ name: "Household items", quantity: 1 }];
}

function budgetAmountMinor(budget: string): number | undefined {
  if (/best value/i.test(budget)) return undefined;

  const values = budget.match(/[\d,]+/g);
  const finalValue = values?.at(-1);

  return finalValue ? Number(finalValue.replaceAll(",", "")) * 100 : undefined;
}

export function createMovingSpecification(
  input: MovingBriefInput,
): JobSpecification {
  const access = input.access.toLowerCase();
  const pickupStairs = access.includes("pickup")
    ? Number(access.match(/(\d+)\s+flight/)?.[1] ?? 1)
    : 0;
  const dropoffStairs = access.includes("drop-off")
    ? Number(access.match(/(\d+)\s+flight[^;,.]*drop-off/)?.[1] ?? 1)
    : 0;
  const targetBudget = budgetAmountMinor(input.budget);

  return {
    vertical: "moving",
    pickupAddress: { formattedAddress: input.origin.trim() },
    dropoffAddress: { formattedAddress: input.destination.trim() },
    movingDate: input.moveDate,
    bedrooms: bedroomsFromHomeSize(input.homeSize),
    pickupStairs,
    dropoffStairs,
    hasElevator: /elevator/i.test(input.access),
    inventory: inventoryFromSummary(input.inventory),
    packingPreference: "none",
    ...(targetBudget === undefined
      ? {}
      : { budget: { amountMinor: targetBudget, currency: "USD" } }),
    notes: [input.access, `Timing preference: ${input.flexibility}`]
      .filter(Boolean)
      .join(". "),
  };
}

export function inventorySummary(specification: JobSpecification): string {
  return specification.inventory
    .map(
      (item) => `${item.quantity > 1 ? `${item.quantity} ` : ""}${item.name}`,
    )
    .join(", ");
}

export function accessSummary(specification: JobSpecification): string {
  const details: string[] = [];

  if (specification.pickupStairs > 0) {
    details.push(
      `${specification.pickupStairs} flight${specification.pickupStairs === 1 ? "" : "s"} at pickup`,
    );
  }

  if (specification.dropoffStairs > 0) {
    details.push(
      `${specification.dropoffStairs} flight${specification.dropoffStairs === 1 ? "" : "s"} at drop-off`,
    );
  }

  if (specification.hasElevator) details.push("elevator available");

  return details.length > 0 ? details.join("; ") : "Ground-floor access";
}

export function homeSizeLabel(specification: JobSpecification): string {
  if (specification.bedrooms === 0) return "Studio apartment";

  return `${specification.bedrooms}-bedroom ${specification.bedrooms >= 3 ? "home" : "apartment"}`;
}
