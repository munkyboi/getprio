function maskNamePart(namePart: string): string {
  if (!namePart) {
    return "";
  }

  if (namePart.length === 1) {
    return `${namePart[0]}***`;
  }

  return `${namePart[0]}***${namePart[namePart.length - 1]}`;
}

export function maskCustomerName(name?: string | null): string {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map(maskNamePart)
    .join(" ");
}

export function getQueueCustomerDisplayName(
  customerName?: string | null,
  customerDisplayName?: string | null
): string {
  return customerDisplayName?.trim() || maskCustomerName(customerName) || "Customer";
}

export function getQueueCustomerFullNameLabel(
  customerName?: string | null,
  customerDisplayName?: string | null
): string {
  const fullName = String(customerName || "").trim();
  const displayName = customerDisplayName?.trim();

  if (!fullName) {
    return displayName || "Customer";
  }

  if (!displayName || displayName.localeCompare(fullName, undefined, { sensitivity: "accent" }) === 0) {
    return fullName;
  }

  return `${fullName} (${displayName})`;
}
