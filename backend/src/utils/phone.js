function normalizePhilippineMobileNumber(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("63") && digits.length === 12) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.length === 10 && digits.startsWith("9")) {
    digits = `0${digits}`;
  }

  return digits.slice(0, 11);
}

function isPhilippineMobileNumber(value) {
  return /^09\d{9}$/.test(normalizePhilippineMobileNumber(value));
}

module.exports = {
  normalizePhilippineMobileNumber,
  isPhilippineMobileNumber
};
