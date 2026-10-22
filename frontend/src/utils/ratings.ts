const compactRatingCountFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1
});

export function formatRatingCount(value: number): string {
  const count = Math.max(0, Math.trunc(Number(value) || 0));
  if (count < 1000) {
    return String(count);
  }

  return compactRatingCountFormatter.format(count).toLowerCase();
}
