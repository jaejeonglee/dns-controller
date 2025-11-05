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
  server: {
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
  },
};
