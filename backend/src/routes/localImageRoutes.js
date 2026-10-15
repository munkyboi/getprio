const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const {
  localImageStorageEnabled,
  readLocalImage,
} = require("../services/localImageStorage");
function createLocalImageRouter({ read = readLocalImage } = {}) {
  const router = express.Router();
  // Every asset read remains local; private proofs additionally require a short-lived
  // capability issued through the existing authenticated booking-access endpoint.
  router.use((req, res, next) => {
    if (
      !localImageStorageEnabled() ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress,
      )
    )
      return res.sendStatus(404);
    next();
  });
  function sendImage(image, res) {
    res
      .set({
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-site",
        "Content-Type": image.contentType,
        "Content-Disposition": `inline; filename="image.${image.extension}"`,
      })
      .send(image.body);
  }
  router.get(
    "/private/:id",
    asyncHandler(async (req, res) => {
      const image = await read(req.params.id, {
        expires: req.query.expires,
        signature: req.query.signature,
      });
      sendImage(image, res);
    }),
  );
  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const image = await read(req.params.id);
      sendImage(image, res);
    }),
  );
  return router;
}
module.exports = createLocalImageRouter();
module.exports.createLocalImageRouter = createLocalImageRouter;
