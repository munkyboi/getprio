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
function queryFields(query, allowed) {
  if (
    Object.keys(query).some((key) => !allowed.includes(key)) ||
    Object.values(query).some((value) => typeof value !== "string")
  )
    throw Object.assign(new Error("Invalid resource report query."), {
      statusCode: 400,
    });
}
router.get(
  "/scopes",
  asyncHandler(async (req, res) => {
    queryFields(req.query, ["q"]);
    res.json(
      await service.searchScopes({
        user: req.user,
        session: req.auth.session,
        query: req.query.q ?? "",
      }),
    );
  }),
);
router.get(
  "/report",
  asyncHandler(async (req, res) => {
    queryFields(req.query, [
      "tenantId",
      "locationId",
      "windowFrom",
      "windowTo",
    ]);
    res.json(
      await service.read({
        user: req.user,
        session: req.auth.session,
        input: req.query,
      }),
    );
  }),
);
module.exports = router;
