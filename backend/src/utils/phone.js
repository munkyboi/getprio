function normalizePhilippineMobileNumber(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function isPhilippineMobileNumber(value) {
  return /^09\d{9}$/.test(normalizePhilippineMobileNumber(value));
}

module.exports = {
  normalizePhilippineMobileNumber,
  isPhilippineMobileNumber
};
