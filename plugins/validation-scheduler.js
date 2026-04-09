const fp = require("fastify-plugin");
const config = require("../configs/index");
const { runPeriodicValidation } = require("../services/validation");

function getMsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return midnight - now;
}

async function validationScheduler(fastify) {
  if (!config.validation.enabled || config.bind.devMode) {
    fastify.log.info("DNS validation scheduler disabled");
    return;
  }

  let intervalId = null;
  let initialTimeoutId = null;

  fastify.addHook("onReady", async () => {
    // Schedule first run at next midnight, then repeat daily
    const msUntilMidnight = getMsUntilMidnight();
    fastify.log.info(
      `DNS validation scheduled: first run in ${Math.round(msUntilMidnight / 1000 / 60)} minutes (at midnight)`
    );

    initialTimeoutId = setTimeout(() => {
      runPeriodicValidation(fastify).catch((err) => {
        fastify.log.error(err, "Periodic DNS validation failed");
      });

      // Then repeat every 24 hours
      intervalId = setInterval(() => {
        runPeriodicValidation(fastify).catch((err) => {
          fastify.log.error(err, "Periodic DNS validation failed");
        });
      }, config.validation.intervalMs);
    }, msUntilMidnight);
  });

  fastify.addHook("onClose", async () => {
    if (initialTimeoutId) clearTimeout(initialTimeoutId);
    if (intervalId) clearInterval(intervalId);
  });
}

module.exports = fp(validationScheduler);
