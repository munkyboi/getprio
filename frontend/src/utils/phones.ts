const PH_MOBILE_DIGITS = /^09\d{9}$/;

export function normalizePhilippineMobileNumber(value: string) {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

export function isPhilippineMobileNumber(value: string) {
  return PH_MOBILE_DIGITS.test(normalizePhilippineMobileNumber(value));
}

export function formatPhilippineMobileNumber(value: string) {
  const digits = normalizePhilippineMobileNumber(value);
  if (!digits) {
    return "";
  }

  const first = digits.slice(0, 4);
  const second = digits.slice(4, 7);
  const third = digits.slice(7, 11);

  if (digits.length <= 4) {
    return `(${first}`;
  }

  if (digits.length <= 7) {
    return `(${first}) ${second}`;
  }

  return `(${first}) ${second}-${third}`;
}
