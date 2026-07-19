export function evidencePointLabel(
  count: number,
  options: { verified?: boolean } = {},
): string {
  const verified = options.verified ? "verified " : "";
  const noun = count === 1 ? "evidence point" : "evidence points";

  return `${count} ${verified}${noun}`;
}

export function evidenceSupportCopy(
  count: number,
  subject: string,
  options: { verified?: boolean } = {},
): string {
  const verb = count === 1 ? "supports" : "support";

  return `${evidencePointLabel(count, options)} ${verb} ${subject}`;
}
