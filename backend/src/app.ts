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

function normalizeOrigin(origin?: string): string {
  return String(origin || "").replace(/\/$/, "");
}

function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const configuredOrigins = [env.clientUrl, env.appBaseUrl, env.platformDashboardUrl, env.developerPortalUrl]
    .filter(Boolean)
    .map((origin) => normalizeOrigin(origin));

  for (const origin of configuredOrigins) {
    origins.add(origin);

    try {
      const url = new URL(origin);
      if (!url.port) {
        continue;
      }

      origins.add(`${url.protocol}//localhost:${url.port}`);
      origins.add(`${url.protocol}//127.0.0.1:${url.port}`);
    } catch {
      // Ignore invalid URLs and keep the configured value only.
    }
  }

  return origins;
}

const allowedOrigins = buildAllowedOrigins();
const app = express();
const { createRequestContextMiddleware } = requestContextModule;
const { createCsrfProtection } = csrfProtectionModule;
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1_000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket.remoteAddress || "unknown"),
  message: { message: "Too many requests. Please try again later." }
});

app.use(createRequestContextMiddleware({ rolloutCohort: env.rolloutCohort }));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS."));
    },
    credentials: true,
    exposedHeaders: ["Retry-After", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"]
  })
);
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
