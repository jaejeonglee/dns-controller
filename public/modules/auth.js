import { resetMessage } from "./ui.js";
import { t } from "./i18n.js";

export function initializeLoginPage() {
  resetMessage();

  const btn = document.getElementById("google-login-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    window.location.href = "/api/auth/google";
  });
}
