import express from "express";
import cors from "cors";
import morgan from "morgan";
import env from "./config/env";
import authRoutes from "./routes/authRoutes";
import accountRoutes from "./routes/accountRoutes";
import billingRoutes from "./routes/billingRoutes";
import paymongoWebhookRoutes from "./routes/paymongoWebhookRoutes";
import platformRoutes from "./routes/platformRoutes";
import publicRoutes from "./routes/publicRoutes";
import vendorRoutes from "./routes/vendorRoutes";
import errorHandler from "./middleware/errorHandler";

function normalizeOrigin(origin?: string): string {
  return String(origin || "").replace(/\/$/, "");
}

function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const configuredOrigins = [env.clientUrl, env.appBaseUrl, env.platformDashboardUrl]
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

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS."));
    },
    credentials: true
  })
);
app.use("/api/billing/webhooks", paymongoWebhookRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/vendor", vendorRoutes);

app.use(errorHandler);

export default app;
