import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    env: {
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
      GOOGLE_CALLBACK_URL: "http://localhost:3000/api/auth/google/callback",
      JWT_SECRET: "test-secret-at-least-32-characters-long",
      DB_USER: "test",
      DB_PASSWORD: "test",
      DB_DATABASE: "test",
      BIND_DEV_MODE: "true",
    },
  },
});
