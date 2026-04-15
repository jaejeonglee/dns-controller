// services/blacklist.js

const RESERVED_NAMES = new Set([
  "admin", "www", "mail", "ftp", "ns1", "ns2", "api",
  "mx", "smtp", "pop", "imap", "webmail",
  "_dmarc", "_acme-challenge", "autoconfig", "autodiscover",
]);

const PHISHING_KEYWORDS = [
  "paypal", "google-login", "facebook-auth", "bank",
  "secure-login", "signin", "account-verify",
];

/**
 * Check if a subdomain name is blacklisted
 * @param {string} subdomain - normalized (lowercase, trimmed)
 * @returns {{ blocked: boolean, reason?: string }}
 */
function isBlacklisted(subdomain) {
  if (RESERVED_NAMES.has(subdomain)) {
    return { blocked: true, reason: "This subdomain name is reserved." };
  }

  for (const keyword of PHISHING_KEYWORDS) {
    if (subdomain.includes(keyword)) {
      return { blocked: true, reason: "This subdomain name is blocked by security policy." };
    }
  }

  return { blocked: false };
}

module.exports = { isBlacklisted };
