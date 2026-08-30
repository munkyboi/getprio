/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const candidates = [
  path.resolve(__dirname, "../mobile/queueJoinRoutes.js"),
  path.resolve(__dirname, "../../mobile/queueJoinRoutes.js")
];
const router = require(candidates.find((candidate: string) => fs.existsSync(candidate)) || candidates[1]);

export default router;
