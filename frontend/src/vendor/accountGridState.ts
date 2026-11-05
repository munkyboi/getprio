export function accountGridColumns(cols: unknown): Record<string, number> {
  const responsive = typeof cols === "number" ? { sm: cols } : cols && typeof cols === "object" ? cols : {};
  const result: Record<string, number> = { "--account-cols-base": 1 };
  for (const breakpoint of ["xs", "sm", "md", "lg", "xl"]) {
    const count = (responsive as Record<string, unknown>)[breakpoint];
    if (typeof count === "number" && Number.isInteger(count) && count > 0 && count <= 12) {
      result[`--account-cols-${breakpoint}`] = count;
    }
  }
  return result;
}
