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
                    <svg id="theme-icon-sun" class="theme-icon" fill="currentColor" viewBox="0 0 20 20" style="display: none;">
                        <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zm-10.607.707l-.707-.707a1 1 0 00-1.414 1.414l.707.707a1 1 0 001.414-1.414zM3 10a1 1 0 01-1-1V8a1 1 0 112 0v1a1 1 0 01-1 1zm10.607 2.121l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 011.414-1.414zM4 10a1 1 0 01-1-1V8a1 1 0 112 0v1a1 1 0 01-1 1zm-.464 4.95l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM17 9a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zm-5.121.464l-.707-.707a1 1 0 011.414-1.414l.707.707a1 1 0 01-1.414 1.414zM10 15a1 1 0 01-1 1v1a1 1 0 112 0v-1a1 1 0 01-1-1zM10 5a1 1 0 01-1-1V3a1 1 0 112 0v1a1 1 0 01-1 1z"></path>
                    </svg>
                    <svg id="theme-icon-moon" class="theme-icon" fill="currentColor" viewBox="0 0 20 20" style="display: none;">
                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
                    </svg>
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
