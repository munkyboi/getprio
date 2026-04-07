const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const env = require("./config/env");
const authRoutes = require("./routes/authRoutes");
const publicRoutes = require("./routes/publicRoutes");
const vendorRoutes = require("./routes/vendorRoutes");
const errorHandler = require("./middleware/errorHandler");

function normalizeOrigin(origin) {
  return String(origin || "").replace(/\/$/, "");
}

function buildAllowedOrigins() {
  const origins = new Set();
  const configuredOrigins = [env.clientUrl, env.appBaseUrl]
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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/vendor", vendorRoutes);

app.use(errorHandler);

module.exports = app;
