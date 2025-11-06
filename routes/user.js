const crypto = require("crypto");
const { sendVerificationEmail } = require("../services/email");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toMySqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function buildVerificationHtml(message) {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Email verification</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f5f6f9; color: #1d2330; margin: 0; padding: 40px 16px; }
        .card { max-width: 480px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 12px; box-shadow: 0 18px 30px rgba(16, 25, 44, 0.08); text-align: center; }
        h1 { font-size: 1.6rem; margin-bottom: 18px; color: #1c2d4a; }
        p { line-height: 1.6; }
        a { display: inline-block; margin-top: 18px; color: #1c2d4a; text-decoration: none; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Email verification</h1>
        <p>${message}</p>
        <a href="/login.html">Back to login</a>
      </div>
    </body>
  </html>`;
}

async function userRoutes(fastify, options) {
  // ----------------------------------------------------
  // POST /api/auth/signup (sign up)
  // ----------------------------------------------------
  fastify.post("/signup", async (request, reply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply
        .code(400)
        .send({ error: "Please provide both email and password." });
    }

    const connection = await fastify.mysql.getConnection();

    try {
      await connection.beginTransaction();

      const hashedPassword = await fastify.bcrypt.hash(password, 10);
      const [result] = await connection.execute(
        "INSERT INTO users (email, password, is_verified) VALUES (?, ?, 0)",
        [email, hashedPassword]
      );

      const userId = result.insertId;
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + ONE_DAY_MS);

      await connection.execute(
        "INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)",
        [userId, token, toMySqlDateTime(expiresAt)]
      );

      await connection.commit();
      connection.release();

      try {
        await sendVerificationEmail(email, token);
      } catch (emailError) {
        fastify.log.error(emailError, "Failed to send verification email");

        await fastify.mysql.execute(
          "DELETE FROM email_verifications WHERE user_id = ?",
          [userId]
        );
        await fastify.mysql.execute("DELETE FROM users WHERE id = ?", [
          userId,
        ]);

        return reply.code(500).send({
          error:
            "Could not send verification email. Please try signing up again later.",
        });
      }

      fastify.log.info(
        `Sign-up initiated for ${email} (ID: ${userId}). Verification email sent.`
      );
      return reply.code(201).send({
        success: true,
        message:
          "Sign-up successful. Please check your email to verify your account.",
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        fastify.log.error(rollbackError, "Failed to roll back signup transaction");
      }
      connection.release();

      if (error.code === "ER_DUP_ENTRY") {
        fastify.log.warn(`Signup failed: Email already exists - ${email}`);
        return reply
          .code(409)
          .send({ error: "This email address is already registered." });
      }
      fastify.log.error(error, "Signup failed");
      return reply
        .code(500)
        .send({ error: "A server error occurred. Please try again later." });
    }
  });

  // ----------------------------------------------------
  // POST /api/auth/login (log in)
  // ----------------------------------------------------
  fastify.post("/login", async (request, reply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply
        .code(400)
        .send({ error: "Please provide both email and password." });
    }

    try {
      const [rows] = await fastify.mysql.execute(
        "SELECT id, email, password, is_verified FROM users WHERE email = ?",
        [email]
      );
      const user = rows[0];

      if (!user) {
        return reply
          .code(401)
          .send({ error: "Email or password is incorrect." });
      }

      const match = await fastify.bcrypt.compare(password, user.password);

      if (!match) {
        return reply
          .code(401)
          .send({ error: "Email or password is incorrect." });
      }

      if (!user.is_verified) {
        return reply
          .code(403)
          .send({
            error:
              "Please verify your email address before logging in. Check your inbox for the verification link.",
          });
      }

      const token = fastify.jwt.sign(
        {
          id: user.id,
          email: user.email,
        },
        { expiresIn: "7d" }
      );

      fastify.log.info(`User logged in: ${email}`);
      return reply.send({ success: true, token });
    } catch (error) {
      fastify.log.error(error, "Login failed");
      return reply
        .code(500)
        .send({ error: "A server error occurred. Please try again later." });
    }
  });

  // ----------------------------------------------------
  // GET /api/auth/verify-email (verify signup token)
  // ----------------------------------------------------
  fastify.get("/verify-email", async (request, reply) => {
    const token = String(request.query.token || "").trim();

    if (!token) {
      reply.header("Content-Type", "text/html; charset=utf-8");
      return reply
        .code(400)
        .send(
          buildVerificationHtml(
            "Verification token must be provided. Please use the link sent to your email."
          )
        );
    }

    try {
      const [rows] = await fastify.mysql.execute(
        "SELECT user_id, expires_at FROM email_verifications WHERE token = ?",
        [token]
      );
      const record = rows[0];

      if (!record) {
        reply.header("Content-Type", "text/html; charset=utf-8");
        return reply
          .code(404)
          .send(
            buildVerificationHtml(
              "This verification link is invalid or has already been used. If you need a new link, please sign up again."
            )
          );
      }

      const expiresAt = new Date(record.expires_at);
      if (Number.isFinite(expiresAt.getTime()) && expiresAt < new Date()) {
        await fastify.mysql.execute(
          "DELETE FROM email_verifications WHERE token = ?",
          [token]
        );
        reply.header("Content-Type", "text/html; charset=utf-8");
        return reply
          .code(410)
          .send(
            buildVerificationHtml(
              "This verification link has expired. Please sign up again to receive a new verification email."
            )
          );
      }

      await fastify.mysql.execute(
        "UPDATE users SET is_verified = 1 WHERE id = ?",
        [record.user_id]
      );
      await fastify.mysql.execute(
        "DELETE FROM email_verifications WHERE user_id = ?",
        [record.user_id]
      );

      fastify.log.info(`User verified email: userId=${record.user_id}`);
      reply.header("Content-Type", "text/html; charset=utf-8");
      return reply.send(
        buildVerificationHtml(
          "Your email address has been verified successfully. You can now log in to your account."
        )
      );
    } catch (error) {
      fastify.log.error(error, "Email verification failed");
      reply.header("Content-Type", "text/html; charset=utf-8");
      return reply
        .code(500)
        .send(
          buildVerificationHtml(
            "We could not verify your email due to a server error. Please try again later."
          )
        );
    }
  });
}

module.exports = userRoutes;
