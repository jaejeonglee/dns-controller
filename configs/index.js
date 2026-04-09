require("dotenv").config();

const required = ["JWT_SECRET", "DB_USER", "DB_PASSWORD", "DB_DATABASE"];
const devMode =
  String(process.env.BIND_DEV_MODE || "").trim().toLowerCase() === "true";

if (!devMode && !process.env.BIND_DB_PATH) {
  required.push("BIND_DB_PATH");
}

function parseIntEnv(envKey, defaultVal) {
  const raw = process.env[envKey];
  if (raw === undefined || raw === "") return defaultVal;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value for ${envKey}: ${raw}`);
  }
  return parsed;
}

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`
  );
}

module.exports = {
  db: {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
  },
  bind: {
    zoneFilePath: (domain) => `${process.env.BIND_DB_PATH}/db.${domain}`,
    devMode,
  },
  email: {
    from: process.env.EMAIL_FROM,
    verificationUrl: process.env.EMAIL_VERIFICATION_URL,
    gmail: {
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      redirectUri: process.env.GMAIL_REDIRECT_URI,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      user: process.env.GMAIL_SENDER || process.env.GMAIL_USER || process.env.SMTP_USER,
    },
  },
  validation: {
    enabled:
      String(process.env.VALIDATION_ENABLED || "true")
        .trim()
        .toLowerCase() === "true",
    intervalMs: parseIntEnv("VALIDATION_INTERVAL_MS", 24 * 60 * 60 * 1000),
    tcpTimeoutMs: parseIntEnv("VALIDATION_TCP_TIMEOUT_MS", 3000),
    concurrency: parseIntEnv("VALIDATION_CONCURRENCY", 5),
    batchSize: parseIntEnv("VALIDATION_BATCH_SIZE", 50),
  },
  server: {
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
  },
};
