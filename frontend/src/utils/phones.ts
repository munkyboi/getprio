const PH_MOBILE_DIGITS = /^09\d{9}$/;

export function normalizePhilippineMobileNumber(value: string) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("63") && digits.length === 12) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.length === 10 && digits.startsWith("9")) {
    digits = `0${digits}`;
  }

  return digits.slice(0, 11);
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
