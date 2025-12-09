import { apiFetch } from "./api.js";
import { showMessage, setButtonLoading, clearButtonLoading, resetMessage } from "./ui.js";
import { navigateTo } from "./router.js";

function setupAuthForm(form, config) {
  if (!form) return;

  const emailInput = form.querySelector("#auth-email");
  const passwordInput = form.querySelector("#auth-password");
  const submitBtn = form.querySelector("#auth-submit-btn");

  if (!emailInput || !passwordInput || !submitBtn) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      showMessage("Please provide both email and password.", "error");
      return;
    }

    setButtonLoading(submitBtn, config.loadingLabel);
    try {
      const data = await apiFetch(config.endpoint, {
        method: "POST",
        body: { email, password },
      });

      if (typeof config.onSuccess === "function") {
        await config.onSuccess(data);
      }
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      clearButtonLoading(submitBtn);
    }
  });
}

export function initializeLoginPage() {
  resetMessage();
  const form = document.getElementById("login-form");

  setupAuthForm(form, {
    endpoint: "/api/auth/login",
    loadingLabel: "Logging in…",
    onSuccess: (data) => {
      if (data?.token) {
        localStorage.setItem("token", data.token);
      }
      showMessage("Login successful! Redirecting…", "success");
      setTimeout(() => navigateTo("/dashboard"), 800);
    },
  });
}

export function initializeSignupPage() {
  resetMessage();
  const form = document.getElementById("signup-form");

  setupAuthForm(form, {
    endpoint: "/api/auth/signup",
    loadingLabel: "Creating account…",
    onSuccess: (data) => {
      const message =
        data?.message ||
        "Sign-up successful. Please check your email to verify your account.";
      showMessage(message, "success");
      form.reset();
    },
  });
}
