import type { JobSpecification, JobSpecificationExtraction } from "~/types/api";

export const MAX_INTAKE_FILE_BYTES = 20 * 1024 * 1024;

const allowedFileTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const allowedFileExtensions = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);

export interface MovingIntakeFields {
  access: string;
  budget: string;
  destination: string;
  flexibility: string;
  homeSize: string;
  inventory: string;
  moveDate: string;
  origin: string;
}

function extractedAccess(
  facts: JobSpecificationExtraction["facts"],
): string | undefined {
  const hasAccessFact =
    facts.pickupStairs !== undefined ||
    facts.dropoffStairs !== undefined ||
    facts.hasElevator !== undefined;

  if (!hasAccessFact) return undefined;

  const details: string[] = [];
  if ((facts.pickupStairs ?? 0) > 0) {
    details.push(
      `${facts.pickupStairs} flight${facts.pickupStairs === 1 ? "" : "s"} at pickup`,
    );
  }
  if ((facts.dropoffStairs ?? 0) > 0) {
    details.push(
      `${facts.dropoffStairs} flight${facts.dropoffStairs === 1 ? "" : "s"} at drop-off`,
    );
  }
  if (facts.hasElevator) details.push("elevator available");

  return details.length > 0 ? details.join("; ") : "Ground-floor access";
}

function extractedInventory(
  facts: JobSpecificationExtraction["facts"],
): string | undefined {
  const inventory = facts.inventory?.map((item) =>
    `${item.quantity > 1 ? `${item.quantity} ` : ""}${item.name}`.trim(),
  );
  const items = [...(inventory ?? []), ...(facts.specialItems ?? [])].filter(
    Boolean,
  );

  return items.length > 0 ? [...new Set(items)].join(", ") : undefined;
}

function extractedHomeSize(bedrooms: number | undefined): string | undefined {
  if (bedrooms === undefined) return undefined;
  if (bedrooms === 0) return "Studio apartment";

  return `${bedrooms}-bedroom ${bedrooms >= 3 ? "home" : "apartment"}`;
}

function extractedBudget(
  budget: JobSpecification["budget"] | undefined,
): string | undefined {
  if (!budget) return undefined;

  const amount = new Intl.NumberFormat("en-US", {
    currency: budget.currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(budget.amountMinor / 100);

  return `Under ${amount}`;
}

export function mergeIntakeExtraction(
  current: MovingIntakeFields,
  extraction: JobSpecificationExtraction | undefined,
): MovingIntakeFields {
  if (!extraction) return current;

  const facts = extraction.facts;
  const access = extractedAccess(facts);
  const inventory = extractedInventory(facts);
  const homeSize = extractedHomeSize(facts.bedrooms);
  const budget = extractedBudget(facts.budget);
  const timing = facts.notes
    ?.match(/Timing preference:\s*([^.]*)/i)?.[1]
    ?.trim();

  return {
    ...current,
    ...(access ? { access } : {}),
    ...(budget ? { budget } : {}),
    ...(facts.dropoffAddress?.formattedAddress
      ? { destination: facts.dropoffAddress.formattedAddress }
      : {}),
    ...(timing ? { flexibility: timing } : {}),
    ...(homeSize ? { homeSize } : {}),
    ...(inventory ? { inventory } : {}),
    ...(facts.movingDate ? { moveDate: facts.movingDate } : {}),
    ...(facts.pickupAddress?.formattedAddress
      ? { origin: facts.pickupAddress.formattedAddress }
      : {}),
  };
}

export function intakeFileError(file: File): string | undefined {
  if (file.size > MAX_INTAKE_FILE_BYTES) {
    return "Choose a file smaller than 20 MB.";
  }

  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (
    !allowedFileTypes.has(file.type) &&
    !allowedFileExtensions.has(extension)
  ) {
    return "Choose a PDF, JPG, PNG, or WebP file.";
  }

  return undefined;
}

export function extractionConfidenceLabel(
  extraction: JobSpecificationExtraction | undefined,
): string {
  if (extraction?.confidence === undefined) return "Ready for your review";

  return `${Math.round(extraction.confidence * 100)}% extraction confidence`;
}
