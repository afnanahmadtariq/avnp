export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function formatSavings(value: number): string {
  return value > 0 ? `Save ${formatCurrency(value)}` : "No verified savings";
}
