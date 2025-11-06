require("dotenv").config();

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
    devMode:
      String(process.env.BIND_DEV_MODE || "").trim().toLowerCase() === "true",
  },
  email: {
    from: process.env.EMAIL_FROM,
    verificationUrl: process.env.EMAIL_VERIFICATION_URL,
    service: process.env.EMAIL_SERVICE,
    transport: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
      secure:
        String(process.env.SMTP_SECURE || "")
          .trim()
          .toLowerCase() === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tlsRejectUnauthorized:
        String(process.env.EMAIL_TLS_REJECT_UNAUTHORIZED || "")
          .trim()
          .toLowerCase() === "false"
          ? false
          : undefined,
    },
  },
  server: {
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
  },
};
