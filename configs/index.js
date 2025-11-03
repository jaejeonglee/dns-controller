// configs/index.js
require("dotenv").config();

module.exports = {
  bind: {
    zoneFilePath: (domain) => `${process.env.BIND_DB_PATH}/db.${domain}`,
  },
  server: {
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
  },
};
