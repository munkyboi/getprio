const { storeApplicationImage } = require("./localApplicationImageStorage");

async function storeLocalVendorPaymentQr(input) {
  return storeApplicationImage({ ...input, purpose: "payment-qr" });
}

module.exports = { storeLocalVendorPaymentQr };
