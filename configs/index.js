// config/index.js
require("dotenv").config();

module.exports = {
  cloudflare: {
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    domain: process.env.DOMAIN,
  },
  server: {
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
  },
};
