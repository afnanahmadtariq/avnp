export type ClassValue = false | null | string | undefined;

export const relayClasses = {
  button: {
    base: "relay-button",
    variants: {
      primary: "relay-button--primary",
      secondary: "relay-button--secondary",
    },
  },
  card: "relay-card",
  cardTitle: "relay-card__title",
  eyebrow: "relay-eyebrow",
  kpi: {
    base: "relay-kpi",
    detail: "relay-kpi__detail",
    label: "relay-kpi__label",
    tones: {
      neutral: "relay-kpi--neutral",
      positive: "relay-kpi--positive",
      warning: "relay-kpi--warning",
    },
    value: "relay-kpi__value",
  },
  screenReaderOnly: "relay-sr-only",
  status: {
    base: "relay-status",
    dot: "relay-status__dot",
    tones: {
      active: "relay-status--active",
      complete: "relay-status--complete",
      idle: "relay-status--idle",
      warning: "relay-status--warning",
    },
  },
  workflow: {
    base: "relay-workflow",
    item: "relay-workflow__item",
    marker: "relay-workflow__marker",
    markerStates: {
      complete: "relay-workflow__marker--complete",
      current: "relay-workflow__marker--current",
      upcoming: "relay-workflow__marker--upcoming",
    },
  },
} as const;

export type ButtonVariant = keyof typeof relayClasses.button.variants;
export type KpiTone = keyof typeof relayClasses.kpi.tones;
export type StatusTone = keyof typeof relayClasses.status.tones;
export type WorkflowStepStatus =
  keyof typeof relayClasses.workflow.markerStates;

export function classNames(...values: readonly ClassValue[]): string {
  return values
    .filter((value): value is string =>
      Boolean(typeof value === "string" && value.trim().length > 0),
    )
    .map((value) => value.trim().replaceAll(/\s+/g, " "))
    .join(" ");
}

export function buttonClassName(
  variant: ButtonVariant = "primary",
  additionalClass?: string,
): string {
  return classNames(
    relayClasses.button.base,
    relayClasses.button.variants[variant],
    additionalClass,
  );
}

export function kpiClassName(
  tone: KpiTone = "neutral",
  additionalClass?: string,
): string {
  return classNames(
    relayClasses.kpi.base,
    relayClasses.kpi.tones[tone],
    additionalClass,
  );
}

export function statusClassName(
  tone: StatusTone = "idle",
  additionalClass?: string,
): string {
  return classNames(
    relayClasses.status.base,
    relayClasses.status.tones[tone],
    additionalClass,
  );
}

export function workflowMarkerClassName(status: WorkflowStepStatus): string {
  return classNames(
    relayClasses.workflow.marker,
    relayClasses.workflow.markerStates[status],
  );
}
