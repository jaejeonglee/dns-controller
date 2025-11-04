/**
 * User authentication routes (sign up & log in)
 * Receives the Fastify instance and plugin options.
 */
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

    try {
      const hashedPassword = await fastify.bcrypt.hash(password, 10);

      const [result] = await fastify.mysql.execute(
        "INSERT INTO users (email, password) VALUES (?, ?)",
        [email, hashedPassword]
      );

      fastify.log.info(`New user created: ${email} (ID: ${result.insertId})`);
      return reply
        .code(201)
        .send({ success: true, message: "Sign-up completed successfully." });
    } catch (error) {
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
        "SELECT * FROM users WHERE email = ?",
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
}

module.exports = userRoutes;
