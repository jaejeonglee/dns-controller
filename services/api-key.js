// services/api-key.js
const crypto = require("crypto");

const KEY_PREFIX = "styo_";
const MAX_KEYS_PER_USER = 3;

/**
 * Generate a new API key
 * @returns {{ key: string, hash: string, prefix: string }}
 */
function generateKey() {
  const random = crypto.randomBytes(16).toString("hex"); // 32 hex chars
  const key = `${KEY_PREFIX}${random}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const prefix = key.slice(0, 12);
  return { key, hash, prefix };
}

/**
 * Hash a raw API key for lookup
 * @param {string} rawKey
 * @returns {string}
 */
function hashKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Validate an API key hash against DB
 * @param {object} fastify
 * @param {string} keyHash
 * @returns {object|null} - user info or null
 */
async function validateKey(fastify, keyHash) {
  const [rows] = await fastify.mysql.execute(
    "SELECT ak.id AS key_id, ak.user_id, u.email, u.name FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.key_hash = ?",
    [keyHash]
  );
  if (rows.length === 0) return null;

  // Update last_used_at (best-effort, don't block)
  fastify.mysql.execute(
    "UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = ?",
    [keyHash]
  ).catch(() => {});

  return rows[0];
}

/**
 * Create a new API key for a user
 * @param {object} fastify
 * @param {number} userId
 * @param {string} name
 * @returns {{ key: string, prefix: string, name: string }}
 */
async function createKey(fastify, userId, name = "default") {
  // Check existing key count
  const [countRows] = await fastify.mysql.execute(
    "SELECT COUNT(*) AS cnt FROM api_keys WHERE user_id = ?",
    [userId]
  );
  if (countRows[0].cnt >= MAX_KEYS_PER_USER) {
    throw Object.assign(
      new Error(`Maximum ${MAX_KEYS_PER_USER} API keys per user.`),
      { statusCode: 400 }
    );
  }

  const { key, hash, prefix } = generateKey();
  await fastify.mysql.execute(
    "INSERT INTO api_keys (user_id, key_hash, key_prefix, name) VALUES (?, ?, ?, ?)",
    [userId, hash, prefix, name]
  );

  return { key, prefix, name };
}

/**
 * List API keys for a user (prefix only)
 * @param {object} fastify
 * @param {number} userId
 * @returns {Array}
 */
async function listKeys(fastify, userId) {
  const [rows] = await fastify.mysql.execute(
    "SELECT id, key_prefix, name, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
    [userId]
  );
  return rows;
}

/**
 * Delete an API key
 * @param {object} fastify
 * @param {number} userId
 * @param {number} keyId
 */
async function deleteKey(fastify, userId, keyId) {
  const [result] = await fastify.mysql.execute(
    "DELETE FROM api_keys WHERE id = ? AND user_id = ?",
    [keyId, userId]
  );
  if (result.affectedRows === 0) {
    throw Object.assign(
      new Error("API key not found."),
      { statusCode: 404 }
    );
  }
}

module.exports = {
  generateKey,
  hashKey,
  validateKey,
  createKey,
  listKeys,
  deleteKey,
};
