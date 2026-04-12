const config = require("../configs/index");

let logger = { info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} };

function setLogger(l) { logger = l; }

async function sendTelegram(text) {
  const token = config.telegram?.botToken;
  const chatId = config.telegram?.alertChatId;
  if (!token || !chatId) {
    logger.warn("Telegram alert not configured, logging only");
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!resp.ok) throw new Error(`Telegram API ${resp.status}`);
  } catch (err) {
    logger.fatal({ alertFailed: true, err }, "CRITICAL alert could not be sent");
  }
}

async function critical(message, context = {}) {
  const text = [
    "━━━━━━━━━━━━━━━",
    "🚨 DNS-CTRL CRITICAL",
    "━━━━━━━━━━━━━━━",
    "",
    message,
    "",
    ...Object.entries(context).map(([k, v]) => `├ ${k}: ${v}`),
  ].join("\n");
  logger.error({ ...context }, message);
  await sendTelegram(text);
}

async function warn(message, context = {}) {
  const text = [
    "━━━━━━━━━━━━━━━",
    "⚠️ DNS-CTRL WARNING",
    "━━━━━━━━━━━━━━━",
    "",
    message,
    "",
    ...Object.entries(context).map(([k, v]) => `├ ${k}: ${v}`),
  ].join("\n");
  logger.warn({ ...context }, message);
  await sendTelegram(text);
}

module.exports = { setLogger, critical, warn };
