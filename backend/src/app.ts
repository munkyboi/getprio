import express from "express";
import { createRequire } from "node:module";
import cors from "cors";
import morgan from "morgan";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import env from "./config/env";
import authRoutes from "./routes/authRoutes";
import accountRoutes from "./routes/accountRoutes";
import billingRoutes from "./routes/billingRoutes";
import paymongoWebhookRoutes from "./routes/paymongoWebhookRoutes";
import platformRoutes from "./routes/platformRoutes";
import publicRoutes from "./routes/publicRoutes";
import queueBoardRoutes from "./routes/queueBoardRoutes";
import pushRoutes from "./routes/pushRoutes";
import mobilePushRoutes from "./routes/mobilePushRoutes";
import mobileQueueJoinRoutes from "./routes/mobileQueueJoinRoutes";
import mobileOAuthRoutes from "./routes/mobileOAuthRoutes";
import mobileSandboxAuthRoutes from "./routes/mobileSandboxAuthRoutes";
import mobileTicketLinkRoutes from "./routes/mobileTicketLinkRoutes";
import mobileTicketRoutes from "./routes/mobileTicketRoutes";
import vendorRoutes from "./routes/vendorRoutes";
import localPoolDemoScopeModule from "./services/localPoolDemoScope";
import developerApiRoutes from "./routes/developerApiRoutes";
import developerAuthRoutes from "./routes/developerAuthRoutes";
import developerProjectRoutes from "./routes/developerProjectRoutes";
import errorHandler from "./middleware/errorHandler";
import requestContextModule from "./middleware/requestContext";
import csrfProtectionModule from "./middleware/csrfProtection";
import requestLogPathModule from "./middleware/requestLogPath";
import browserSurfaceUrlsModule from "./services/browserSurfaceUrls";
import developerApiEnvironmentModule from "./services/developerApiEnvironment";
import localRateLimitPolicy from "./services/localRateLimitPolicy";

const allowedOrigins = new Set([
  ...browserSurfaceUrlsModule.browserAllowedOrigins(env),
  ...browserSurfaceUrlsModule.surfaceOriginSet(env, "marketing")
]);
const app = express();
app.use(developerApiEnvironmentModule.localApiRequestGuard());
const { createRequestContextMiddleware } = requestContextModule;
const { createCsrfProtection } = csrfProtectionModule;
const localRateLimit = localRateLimitPolicy.localRateLimit;
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // The disposable local preview may have several browser tabs open while
  // validating the dashboard. Keep production protection unchanged, but do
  // not let the preview throttle its own read-only polling.
  limit: localRateLimit(1_000, 10_000, process.env),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket.remoteAddress || "unknown"),
  message: { message: "Too many requests. Please try again later." }
});
// Keep every non-/api route behind a bounded request budget before any public
// surface middleware runs. The dedicated /api limiter below retains its
// existing quota; preflights are excluded so CORS behavior is unchanged.
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Keep the local core/sandbox preview responsive while several browser
  // surfaces poll in parallel. Production and non-loopback profiles retain
  // the default global request budget.
  limit: localRateLimit(1_000, 10_000, process.env),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket.remoteAddress || "unknown"),
  skip: (req) => req.method === "OPTIONS" || req.path.startsWith("/api"),
  message: { message: "Too many requests. Please try again later." }
});

app.use(createRequestContextMiddleware({ rolloutCohort: env.rolloutCohort }));

app.use(globalRateLimiter);
app.use(browserSurfaceUrlsModule.createBrowserCorsMiddleware(env, cors));
// Allowed browser clients must be able to read throttling responses and honor
// Retry-After. CORS also completes preflights without consuming API quota.
app.use("/api", apiRateLimiter);
app.use("/api/billing/webhooks", paymongoWebhookRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(createCsrfProtection({
  allowedOrigins,
  csrfSecret: env.csrfSecret,
  authCookieSecure: env.authCookieSecure
}));
app.use(
  morgan((tokens, req, res) =>
    JSON.stringify({
      type: "http_request",
      correlationId: (req as typeof req & { context?: { correlationId?: string } }).context
        ?.correlationId,
      rolloutCohort: env.rolloutCohort,
      method: tokens.method(req, res),
      path: requestLogPathModule.requestLogPath(tokens.url(req, res)),
      status: Number(tokens.status(req, res) || 0),
      responseTimeMs: Number(tokens["response-time"](req, res) || 0)
    })
  )
);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    deploymentSha: process.env.DEPLOY_SHA || null
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/developer", developerAuthRoutes);
app.use("/api/developer", developerProjectRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/mobile/auth", mobileOAuthRoutes);
app.use("/api/mobile/auth", mobileSandboxAuthRoutes);
app.use("/api/mobile/push", mobilePushRoutes);
app.use("/api/mobile", mobileQueueJoinRoutes);
app.use("/api/queue-board", queueBoardRoutes.publicRouter);
app.use("/api/vendor", queueBoardRoutes.vendorRouter);
app.use("/api/vendor", vendorRoutes);
if (localPoolDemoScopeModule.localPoolDemoConfiguration()) {
  const loadLocalRoute = createRequire(__filename);
  app.use("/api/vendor", loadLocalRoute("./routes/localResourceOperationsRoutes"));
  if (process.env.LOCAL_IMAGE_STORAGE_ENABLED === "1") {
    app.use("/api/local-image-assets", loadLocalRoute("./routes/localImageRoutes"));
  }
}
app.use("/v1", developerApiRoutes);

// Keep the legacy namespace available while first-party clients migrate to v1.
// Reuse the same routers and middleware so authorization and response contracts remain identical.
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/developer", developerAuthRoutes);
app.use("/api/v1/developer", developerProjectRoutes);
app.use("/api/v1/account", accountRoutes);
app.use("/api/v1/billing", billingRoutes);
app.use("/api/v1/platform", platformRoutes);
app.use("/api/v1/public", publicRoutes);
app.use("/api/v1/mobile/auth", mobileOAuthRoutes);
app.use("/api/v1/mobile/auth", mobileSandboxAuthRoutes);
app.use("/api/v1/push", pushRoutes);
app.use("/api/v1/mobile/push", mobilePushRoutes);
app.use("/api/v1/mobile", mobileTicketLinkRoutes);
app.use("/api/v1/mobile", mobileTicketRoutes);
app.use("/api/v1/mobile", mobileQueueJoinRoutes);
app.use("/api/v1/queue-board", queueBoardRoutes.publicRouter);
app.use("/api/v1/vendor", queueBoardRoutes.vendorRouter);
app.use("/api/v1/vendor", vendorRoutes);

app.use(errorHandler);

export default app;
