const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { requirePlatformPermission } = require("../middleware/auth");
const service = require("../services/platformResourceInventoryService");
const router = express.Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use(requirePlatformPermission(service.PERMISSION));
function bodyFields(req, allowed) {
  const body = req.body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(req.query).length ||
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    Object.values(body).some((value) => typeof value !== "string")
  )
    throw Object.assign(new Error("Invalid resource report query."), {
      statusCode: 400,
    });
}
router.post(
  "/scopes",
  asyncHandler(async (req, res) => {
    bodyFields(req, ["q"]);
    res.json(
      await service.searchScopes({
        user: req.user,
        session: req.auth.session,
        query: req.body.q ?? "",
      }),
    );
  }),
);
router.post(
  "/report",
  asyncHandler(async (req, res) => {
    bodyFields(req, ["tenantId", "locationId", "windowFrom", "windowTo"]);
    res.json(
      await service.read({
        user: req.user,
        session: req.auth.session,
        input: req.body,
      }),
    );
  }),
);
module.exports = router;
