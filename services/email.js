const nodemailer = require("nodemailer");
const config = require("../configs/index");

let transporter;

function buildTransporter() {
  const emailConfig = config.email || {};
  const { service, transport = {} } = emailConfig;
  const { host, port, secure, auth, tlsRejectUnauthorized } = transport;

  if (!auth?.user || !auth?.pass) {
    throw new Error(
      "SMTP credentials are not configured. Please set SMTP_USER and SMTP_PASS."
    );
  }

  if (service) {
    const options = {
      service,
      auth,
    };
    if (typeof tlsRejectUnauthorized === "boolean") {
      options.tls = { rejectUnauthorized: tlsRejectUnauthorized };
    } else {
      options.tls = { rejectUnauthorized: false };
    }
    return nodemailer.createTransport(options);
  }

  if (!host) {
    throw new Error(
      "SMTP_HOST is not configured. Either provide EMAIL_SERVICE or SMTP_HOST."
    );
  }

  const transporterOptions = {
    host,
    port: port || 587,
    secure: secure ?? false,
    auth,
  };

  if (typeof tlsRejectUnauthorized === "boolean") {
    transporterOptions.tls = {
      rejectUnauthorized: tlsRejectUnauthorized,
    };
  }

  return nodemailer.createTransport(transporterOptions);
}

function getTransporter() {
  if (!transporter) {
    transporter = buildTransporter();
  }
  return transporter;
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

function ensureFromAddress() {
  const from = config.email?.from;
  if (!from) {
    throw new Error("EMAIL_FROM is not configured.");
  }
  return from;
}

async function sendVerificationEmail(to, token) {
  const transporterInstance = getTransporter();
  const verificationBaseUrl = ensureVerificationUrl();
  const from = ensureFromAddress();

  const verificationLink = `${verificationBaseUrl}${
    verificationBaseUrl.includes("?") ? "&" : "?"
  }token=${encodeURIComponent(token)}`;

  const subject = "Verify your Sitey account";
  const text = [
    "Welcome to Sitey!",
    "",
    "Please confirm your email address by clicking the link below:",
    verificationLink,
    "",
    "If you did not request this email, you can safely ignore it.",
  ].join("\n");

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

  await transporterInstance.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

module.exports = {
  sendVerificationEmail,
};
