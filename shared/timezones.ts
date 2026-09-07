export const DEFAULT_TIMEZONE = "Asia/Manila";

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

export function getTimeZoneOptions() {
  const supportedValuesOf = (Intl as IntlWithSupportedValues).supportedValuesOf;
  const supported = supportedValuesOf ? supportedValuesOf("timeZone") : [];

  return Array.from(new Set([DEFAULT_TIMEZONE, "UTC", ...supported])).sort((left, right) =>
    left.localeCompare(right)
  );
}
