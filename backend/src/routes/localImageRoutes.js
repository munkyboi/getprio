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
        // This endpoint serves image bytes only; a document sandbox policy is
        // not useful for an image response and can confuse local previews.
        // The guarded local UI may be served from localhost while the API is
        // reached through 127.0.0.1. Keep the socket loopback gate above; the
        // response must be embeddable across those local development origins.
        "Cross-Origin-Resource-Policy": "cross-origin",
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
