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
    gmail: {
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      redirectUri: process.env.GMAIL_REDIRECT_URI,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      user: process.env.GMAIL_SENDER || process.env.GMAIL_USER || process.env.SMTP_USER,
    },
  },
  server: {
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
  },
};
