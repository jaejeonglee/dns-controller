import { getAuthToken, logoutAndRedirect } from "./api.js";
import { toggleTheme } from "./theme.js";

export function showMessage(message, type = "info") {
  const messageBox = document.getElementById("form-message");
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = "message-box show";
  messageBox.classList.add(type);
}

export function resetMessage() {
  const messageBox = document.getElementById("form-message");
  if (!messageBox) return;

  const defaultMessage =
    messageBox.dataset.defaultMessage || messageBox.textContent || "";

  messageBox.className = "message-box";
  if (defaultMessage) {
    messageBox.textContent = defaultMessage;
    messageBox.classList.add("show", "info");
  } else {
    messageBox.textContent = "";
  }
}

export function setButtonLoading(button, label) {
  if (!button) return;
  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent.trim();
  }
  button.disabled = true;
  button.textContent = label;
}

export function clearButtonLoading(button) {
  if (!button) return;
  const original = button.dataset.originalText;
  if (original) {
    button.textContent = original;
    delete button.dataset.originalText;
  }
  button.disabled = false;
}

export function setHidden(element, shouldHide) {
  if (!element) return;
  element.classList.toggle("hidden", Boolean(shouldHide));
}

export function clearChildren(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

let loaderElement = null;
let loaderCount = 0;

function ensureLoader() {
  if (!loaderElement) {
    loaderElement = document.createElement("div");
    loaderElement.className = "loader-overlay";
    loaderElement.setAttribute("role", "status");
    loaderElement.setAttribute("aria-live", "polite");

    const spinner = document.createElement("div");
    spinner.className = "loader-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const srText = document.createElement("span");
    srText.className = "sr-only";
    srText.textContent = "Loading";

    loaderElement.append(spinner, srText);
    document.body.appendChild(loaderElement);
  }

  return loaderElement;
}

export function showLoader() {
  const element = ensureLoader();
  loaderCount += 1;
  element.classList.add("show");
}

export function hideLoader() {
  if (loaderCount > 0) {
    loaderCount -= 1;
  }
  if (loaderCount === 0 && loaderElement) {
    loaderElement.classList.remove("show");
  }
}

export function formatDomainList(domains = []) {
  return domains.join(", ");
}

export function renderFooter() {
  const container = document.getElementById("footer");
  if (!container) return;
  container.innerHTML = `
    <footer class="site-footer">
      <span class="footer-brand">SITEY</span>
      <span class="footer-divider" aria-hidden="true">|</span>
      <a href="/api/policies/privacy" target="_blank" rel="noopener noreferrer">
        Privacy Policy
      </a>
    </footer>
  `;
}

export function renderNavbar(currentPath) {
    const container = document.getElementById("navbar");
    if (!container) return;

    const token = getAuthToken();

    const navLinks = [
        { path: "/", label: "Home" },
        { path: "/guide", label: "Guide" },
        { path: "/help", label: "Help" },
    ];

    if (token) {
        navLinks.push({ path: "/dashboard", label: "My domains" });
    }

    const authLink = token
        ? `<button type="button" id="nav-logout-btn" class="nav-auth-btn">Log out</button>`
        : `<a href="/login" class="nav-auth-btn ${currentPath === '/login' ? 'active' : ''}">Log in</a>`;

    let html = `
        <nav class="site-nav" aria-label="Primary">
            <div class="nav-left">
                <a href="/" class="nav-logo" aria-label="Sitey Home">
                    <img src="sitey_logo.png" alt="sitey.one logo" width="28" height="28" decoding="async" fetchpriority="high" />
                    <span class="nav-brand">SITEY</span>
                </a>
            </div>
            <div class="nav-center">
                ${navLinks.map(({ path, label }) => `
                    <a href="${path}" class="${currentPath === path ? 'active' : ''}">${label}</a>
                `).join("")}
            </div>
            <div class="nav-right">
                <button type="button" id="theme-toggle-btn" class="nav-auth-btn" aria-label="Toggle theme">
                    <span class="sr-only">Toggle theme</span>
                    <span id="theme-icon-sun" class="theme-icon" style="display: none;">🌝</span>
                    <span id="theme-icon-moon" class="theme-icon" style="display: none;">🌚</span>
                </button>
                ${authLink}
            </div>
        </nav>
    `;

    container.innerHTML = html;

    const logoutBtn = container.querySelector("#nav-logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (event) => {
            event.preventDefault();
            logoutAndRedirect("/");
        });
    }

    const themeToggleBtn = container.querySelector("#theme-toggle-btn");
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", toggleTheme);
    }
}
