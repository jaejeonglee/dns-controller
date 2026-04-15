// utils/validators.js — shared input validation (web + API)

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
const HOSTNAME_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}\.?$/i;

const TXT_MAX_LENGTH = 512;

function isValidSubdomain(name) {
  return SUBDOMAIN_REGEX.test(name);
}

function validateRecordValue(recordType, value, { subdomain, domain }) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return { valid: false, message: "Record value is required." };
  }

  if (recordType === "A") {
    if (!IPV4_REGEX.test(trimmed)) {
      return {
        valid: false,
        message: "Provide a valid IPv4 address (e.g. 203.0.113.10).",
      };
    }
    return { valid: true, value: trimmed };
  }

  const candidate = trimmed.toLowerCase();
  if (!HOSTNAME_REGEX.test(candidate)) {
    return {
      valid: false,
      message: "Provide a valid hostname (e.g. app.example.com).",
    };
  }

  const fullDomain = `${subdomain}.${domain}`.toLowerCase();
  if (candidate.replace(/\.$/, "") === fullDomain.replace(/\.$/, "")) {
    return {
      valid: false,
      message: "CNAME target cannot point to itself.",
    };
  }

  return { valid: true, value: candidate.replace(/\.$/, "") };
}

function validateTxtValue(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return { valid: false, message: "TXT value is required." };
  }
  if (trimmed.length > TXT_MAX_LENGTH) {
    return { valid: false, message: `TXT value must be ${TXT_MAX_LENGTH} characters or fewer.` };
  }
  if (/[\r\n]/.test(trimmed)) {
    return { valid: false, message: "TXT value must not contain newlines." };
  }
  if (/["\\\x00-\x1f]/.test(trimmed)) {
    return { valid: false, message: "TXT value contains invalid characters." };
  }
  return { valid: true, value: trimmed };
}

module.exports = {
  SUBDOMAIN_REGEX,
  IPV4_REGEX,
  HOSTNAME_REGEX,
  isValidSubdomain,
  validateRecordValue,
  validateTxtValue,
};
