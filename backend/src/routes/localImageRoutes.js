const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const applicationImages = require("../services/localApplicationImageStorage");
const {
  localImageStorageEnabled,
  readLocalImage,
} = require("../services/localImageStorage");

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function createLocalImageRouter({
  readApplication = applicationImages.readApplicationImage,
  readApplicationPrivate = applicationImages.readApplicationProof,
  read = readLocalImage
} = {}) {
  const router = express.Router();
  const applicationGate = (req, res, next) => {
    if (!applicationImages.configuration() || !LOOPBACK.has(req.socket.remoteAddress)) return res.sendStatus(404);
    next();
  };
  const sendImage = (image, res) => res.set({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Type": image.contentType,
    "Content-Disposition": `inline; filename="image.${image.extension}"`
  }).send(image.body);

  router.get("/application/:id", applicationGate, asyncHandler(async (req, res) => {
    return sendImage(await readApplication(req.params.id), res);
  }));
  router.get("/application-private/:id", applicationGate, asyncHandler(async (req, res) => {
    return sendImage(await readApplicationPrivate(req.params.id, req.query), res);
  }));

  router.use((req, res, next) => {
    if (!localImageStorageEnabled() || !LOOPBACK.has(req.socket.remoteAddress)) return res.sendStatus(404);
    next();
  });
  router.get("/private/:id", asyncHandler(async (req, res) => {
    return sendImage(await read(req.params.id, {
      expires: req.query.expires,
      signature: req.query.signature
    }), res);
  }));
  router.get("/:id", asyncHandler(async (req, res) => {
    return sendImage(await read(req.params.id), res);
  }));
  return router;
}

module.exports = createLocalImageRouter();
module.exports.createLocalImageRouter = createLocalImageRouter;
