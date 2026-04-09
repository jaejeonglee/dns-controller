const { google } = require("googleapis");
const config = require("../configs/index");

let gmailClient;

function ensureGmailConfig() {
  const emailConfig = config.email || {};
  const gmail = emailConfig.gmail || {};
  const { clientId, clientSecret, redirectUri, refreshToken, user } = gmail;

  if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
    throw new Error(
      "Gmail API credentials are not configured. Please set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI, and GMAIL_REFRESH_TOKEN."
    );
  }

  return { clientId, clientSecret, redirectUri, refreshToken, user };
}

function ensureFromAddress(defaultUser) {
  const from = config.email?.from || defaultUser;
  if (!from) {
    throw new Error(
      "EMAIL_FROM or GMAIL_SENDER must be configured to send verification emails."
    );
  }
  return from;
}

function ensureVerificationUrl() {
  const url = config.email?.verificationUrl;
  if (!url) {
    throw new Error(
      "EMAIL_VERIFICATION_URL is not configured. Please set it to the verification endpoint URL."
    );
  }
  return url;
}

function getGmailClient() {
  if (gmailClient) {
    return gmailClient;
  }

  const { clientId, clientSecret, redirectUri, refreshToken } = ensureGmailConfig();
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  gmailClient = google.gmail({ version: "v1", auth: oauth2Client });
  return gmailClient;
}

function buildRawMessage({ from, to, subject, html }) {
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ];

  const message = messageParts.join("\r\n");
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sendVerificationEmail(to, token) {
  const gmail = getGmailClient();
  const { user } = ensureGmailConfig();
  const from = ensureFromAddress(user);
  const verificationBaseUrl = ensureVerificationUrl();

  const verificationLink = `${verificationBaseUrl}${
    verificationBaseUrl.includes("?") ? "&" : "?"
  }token=${encodeURIComponent(token)}`;

  const subject = "Verify your Sitey account";
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1d2330;">
      <h2 style="color: #1c2d4a;">Welcome to Sitey!</h2>
      <p>Please confirm your email address by clicking the button below.</p>
      <p style="margin: 24px 0;">
        <a href="${verificationLink}" style="display: inline-block; padding: 10px 18px; background: #1c2d4a; color: #ffffff; border-radius: 6px; text-decoration: none;">
          Verify email address
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p><a href="${verificationLink}">${verificationLink}</a></p>
      <p style="margin-top: 24px; font-size: 0.9rem; color: #4b5563;">
        If you did not create an account, you can safely ignore this email.
      </p>
    </div>
  `;

  const raw = buildRawMessage({ from, to, subject, html });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
    },
  });
}

async function sendValidationWarningEmail(to, subdomainInfo) {
  const gmail = getGmailClient();
  const { user } = ensureGmailConfig();
  const from = ensureFromAddress(user);

  const { subdomain, domain, recordType, recordValue } = subdomainInfo;
  const fullDomain = `${subdomain}.${domain}`;

  const subject = `[Sitey] Your subdomain ${fullDomain} has been removed`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1d2330;">
      <h2 style="color: #1c2d4a;">DNS Record Removed</h2>
      <p>Your subdomain <strong>${fullDomain}</strong> has been removed because the target is no longer reachable.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 4px 12px; font-weight: bold;">Subdomain</td><td style="padding: 4px 12px;">${fullDomain}</td></tr>
        <tr><td style="padding: 4px 12px; font-weight: bold;">Record Type</td><td style="padding: 4px 12px;">${recordType}</td></tr>
        <tr><td style="padding: 4px 12px; font-weight: bold;">Target</td><td style="padding: 4px 12px;">${recordValue}</td></tr>
      </table>
      <p>The target failed validation checks on two consecutive days. If you believe this was an error, you can re-register the subdomain.</p>
      <p style="margin-top: 24px; font-size: 0.9rem; color: #4b5563;">
        This is an automated message from Sitey DNS Controller.
      </p>
    </div>
  `;

  const raw = buildRawMessage({ from, to, subject, html });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

module.exports = {
  sendVerificationEmail,
  sendValidationWarningEmail,
};
