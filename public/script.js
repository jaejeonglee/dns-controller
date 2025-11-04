const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;

function getAuthToken() {
  return localStorage.getItem("token");
}

async function apiFetch(url, options = {}) {
  const config = { ...options };
  config.headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  if (config.body && typeof config.body !== "string") {
    config.headers["Content-Type"] =
      config.headers["Content-Type"] || "application/json";
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      const message =
        data?.error ||
        data?.message ||
        `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return data ?? {};
  } catch (error) {
    console.error("API request failed:", error);
    throw new Error(error.message || "Network error, please try again.");
  }
}

function showMessage(message, type = "info") {
  const messageBox = document.getElementById("form-message");
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = "message-box show";
  messageBox.classList.add(type);
}

function resetMessage() {
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

function setButtonLoading(button, label) {
  if (!button) return;
  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent.trim();
  }
  button.disabled = true;
  button.textContent = label;
}

function clearButtonLoading(button) {
  if (!button) return;
  const original = button.dataset.originalText;
  if (original) {
    button.textContent = original;
    delete button.dataset.originalText;
  }
  button.disabled = false;
}

function setHidden(element, shouldHide) {
  if (!element) return;
  element.classList.toggle("hidden", Boolean(shouldHide));
}

function clearChildren(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function formatDomainList(domains = []) {
  return domains.join(", ");
}

function logoutAndRedirect(target = "index.html") {
  localStorage.removeItem("token");
  window.location.href = target;
}

function renderFooter() {
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

function renderNavbar(activePage = "home") {
  const container = document.getElementById("navbar");
  if (!container) return;

  const token = getAuthToken();

  const navLinks = [
    { key: "home", href: "index.html", label: "Home" },
    { key: "guide", href: "guide.html", label: "Guide" },
    { key: "help", href: "help.html", label: "Help" },
  ];

  if (token) {
    navLinks.push({
      key: "dashboard",
      href: "dashboard.html",
      label: "My domains",
    });
  }

  const authLinks = token
    ? [
        {
          type: "button",
          key: "logout",
          label: "Log out",
          id: "nav-logout-btn",
        },
      ]
    : [{ type: "link", key: "login", href: "login.html", label: "Log in" }];

  let html =
    '<nav class="site-nav" aria-label="Primary"><div class="nav-left"><a href="index.html" class="nav-logo" aria-label="Sitey Home"><img src="sitey_logo.png" alt="sitey.one logo" /><span class="nav-brand">SITEY</span></a></div><div class="nav-center">';

  html += navLinks
    .map(
      ({ key, href, label }) =>
        `<a href="${href}" data-nav="${key}" class="${
          activePage === key ? "active" : ""
        }">${label}</a>`
    )
    .join("");

  html += '</div><div class="nav-right">';

  authLinks.forEach((link) => {
    if (link.type === "button") {
      html += `<button type="button" id="${link.id}" class="nav-auth-btn">${link.label}</button>`;
    } else {
      html += `<a href="${link.href}" data-nav="${
        link.key
      }" class="nav-auth-btn ${activePage === link.key ? "active" : ""}">${
        link.label
      }</a>`;
    }
  });

  html += "</div></nav>";
  container.innerHTML = html;

  const logoutBtn = container.querySelector("#nav-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (event) => {
      event.preventDefault();
      logoutAndRedirect("index.html");
    });
  }
}

function createAvailabilityRow(result) {
  const row = document.createElement("div");
  row.className = `result-row ${result.isAvailable ? "available" : "taken"}`;

  const nameSpan = document.createElement("span");
  nameSpan.className = "domain-name";
  nameSpan.textContent = result.fullSubdomain;

  const statusSpan = document.createElement("span");
  statusSpan.className = `status ${result.isAvailable ? "available" : "taken"}`;
  statusSpan.textContent = result.isAvailable ? "Available" : "Taken";

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "primary-button small";

  const isLoggedIn = Boolean(getAuthToken());
  if (isLoggedIn) {
    actionButton.dataset.action = "open-create";
    actionButton.dataset.domain = result.domain;
    actionButton.dataset.subdomain = result.subdomain;
    actionButton.textContent = "Create domain";
  } else {
    actionButton.dataset.target = "login.html";
    actionButton.textContent = "Create domain";
  }

  row.appendChild(nameSpan);
  row.appendChild(statusSpan);
  row.appendChild(actionButton);

  return row;
}

async function loadManagedDomains() {
  const target = document.getElementById("domain-list-span");
  if (!target) return;

  try {
    const data = await apiFetch("/api/managed-domains");
    if (Array.isArray(data.domains) && data.domains.length > 0) {
      target.textContent = formatDomainList(data.domains);
    } else {
      target.textContent = "No domains configured";
    }
  } catch (error) {
    target.textContent = "Unavailable";
  }
}

async function refreshDomainCount() {
  const counter = document.getElementById("domain-count-number");
  if (!counter) return;

  try {
    const data = await apiFetch("/api/stats/active-domains");
    const value =
      typeof data?.activeDomains === "number" ? data.activeDomains : "--";
    counter.textContent = value;
  } catch (error) {
    counter.textContent = "N/A";
  }
}

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

function initializeLoginPage() {
  renderNavbar("login");
  renderFooter();
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
      setTimeout(() => {
        window.location.href = "index.html";
      }, 800);
    },
  });
}

function initializeSignupPage() {
  renderNavbar("signup");
  renderFooter();
  resetMessage();
  const form = document.getElementById("signup-form");

  setupAuthForm(form, {
    endpoint: "/api/auth/signup",
    loadingLabel: "Creating account…",
    onSuccess: (data) => {
      const message =
        data?.message || "Account created successfully. Redirecting…";
      showMessage(message, "success");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 1200);
    },
  });
}

function initializeDashboardPage() {
  resetMessage();
  const token = getAuthToken();

  if (!token) {
    renderNavbar("login");
    renderFooter();
    window.location.href = "login.html";
    return;
  }

  renderNavbar("dashboard");
  renderFooter();

  const dashboardList = document.getElementById("dashboard-list");
  if (!dashboardList) return;

  function createDashboardItem(item, index) {
    const wrapper = document.createElement("article");
    wrapper.className = "dashboard-item";
    wrapper.dataset.subdomain = item.subdomain;
    wrapper.dataset.domain = item.domain_name;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "dashboard-item-header";
    header.setAttribute("aria-expanded", "false");

    const headerContent = document.createElement("div");
    headerContent.className = "dashboard-item-title";

    const domainName = document.createElement("span");
    domainName.className = "domain-name";
    domainName.textContent = `${item.subdomain}.${item.domain_name}`;

    const ipAddress = document.createElement("span");
    ipAddress.className = "ip-address";
    ipAddress.textContent = item.ip;

    headerContent.appendChild(domainName);
    headerContent.appendChild(ipAddress);

    const icon = document.createElement("span");
    icon.className = "dashboard-item-chevron";
    icon.setAttribute("aria-hidden", "true");

    header.appendChild(headerContent);
    header.appendChild(icon);

    const detail = document.createElement("div");
    detail.className = "dashboard-item-detail";
    detail.hidden = true;

    const field = document.createElement("div");
    field.className = "dashboard-item-field";

    const ipLabel = document.createElement("label");
    const inputId = `dashboard-ip-${index}`;
    ipLabel.setAttribute("for", inputId);
    ipLabel.textContent = "IPv4 address";

    const ipInput = document.createElement("input");
    ipInput.type = "text";
    ipInput.id = inputId;
    ipInput.className = "dashboard-ip-input";
    ipInput.value = item.ip || "";
    ipInput.placeholder = "203.0.113.10";
    ipInput.autocomplete = "off";
    ipInput.inputMode = "decimal";

    field.appendChild(ipLabel);
    field.appendChild(ipInput);

    const actions = document.createElement("div");
    actions.className = "dashboard-item-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "primary-button";
    saveButton.dataset.action = "update";
    saveButton.textContent = "Save changes";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-button";
    deleteButton.dataset.action = "delete";
    deleteButton.textContent = "Remove domain";

    actions.appendChild(saveButton);
    actions.appendChild(deleteButton);

    detail.appendChild(field);
    detail.appendChild(actions);

    wrapper.appendChild(header);
    wrapper.appendChild(detail);

    return wrapper;
  }

  function toggleDashboardItem(itemElement, forceExpand) {
    if (!itemElement) return;
    const header = itemElement.querySelector(".dashboard-item-header");
    const detail = itemElement.querySelector(".dashboard-item-detail");
    if (!header || !detail) return;

    const shouldExpand =
      typeof forceExpand === "boolean" ? forceExpand : detail.hidden;

    detail.hidden = !shouldExpand;
    header.setAttribute("aria-expanded", shouldExpand ? "true" : "false");
    itemElement.classList.toggle("expanded", shouldExpand);

    if (shouldExpand) {
      const input = detail.querySelector(".dashboard-ip-input");
      requestAnimationFrame(() => {
        input?.focus();
      });
    }
  }

  async function fetchSubdomains() {
    dashboardList.innerHTML = "<p>Loading your domains…</p>";

    try {
      const data = await apiFetch("/api/subdomains", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const items = Array.isArray(data) ? data : [];
      dashboardList.innerHTML = "";

      if (!items.length) {
        dashboardList.innerHTML =
          "<p>You have not created any domains yet.</p>";
        return;
      }

      const fragment = document.createDocumentFragment();
      items.forEach((item, index) => {
        fragment.appendChild(createDashboardItem(item, index));
      });

      dashboardList.appendChild(fragment);
    } catch (error) {
      showMessage(error.message, "error");
      dashboardList.innerHTML =
        '<p class="error">Could not load your domains.</p>';
    }
  }

  async function handleUpdate(button) {
    if (!button) return;

    const item = button.closest(".dashboard-item");
    if (!item) return;

    const subdomain = item.dataset.subdomain;
    const domain = item.dataset.domain;
    const ipInput = item.querySelector(".dashboard-ip-input");
    const newIp = ipInput?.value.trim();

    if (!subdomain || !domain || !ipInput) return;
    if (!newIp || !IPV4_REGEX.test(newIp)) {
      showMessage("Enter a valid IPv4 address before saving.", "error");
      ipInput.focus();
      ipInput.select();
      return;
    }

    setButtonLoading(button, "Updating…");
    try {
      await apiFetch(`/api/subdomains/${encodeURIComponent(subdomain)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: { ip: newIp, domain },
      });

      showMessage(`Domain ${subdomain}.${domain} updated successfully.`, "success");

      const ipDisplay = item.querySelector(".dashboard-item-header .ip-address");
      if (ipDisplay) {
        ipDisplay.textContent = newIp;
      }
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      clearButtonLoading(button);
    }
  }

  async function handleDelete(button) {
    if (!button) return;

    const item = button.closest(".dashboard-item");
    if (!item) return;

    const subdomain = item.dataset.subdomain;
    const domain = item.dataset.domain;
    if (!subdomain || !domain) return;

    const confirmed = window.confirm(
      `Delete domain ${subdomain}.${domain}? This cannot be undone.`
    );
    if (!confirmed) return;

    setButtonLoading(button, "Deleting…");
    try {
      await apiFetch(`/api/subdomains/${encodeURIComponent(subdomain)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: { domain },
      });

      showMessage(`Domain ${subdomain}.${domain} deleted successfully.`, "success");
      await fetchSubdomains();
      refreshDomainCount();
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      clearButtonLoading(button);
    }
  }

  fetchSubdomains();

  dashboardList.addEventListener("click", (event) => {
    const header = event.target.closest(".dashboard-item-header");
    if (header) {
      const item = header.closest(".dashboard-item");
      toggleDashboardItem(item);
      return;
    }

    const updateButton = event.target.closest("[data-action='update']");
    if (updateButton) {
      handleUpdate(updateButton);
      return;
    }

    const deleteButton = event.target.closest("[data-action='delete']");
    if (deleteButton) {
      handleDelete(deleteButton);
    }
  });
}

function initializeLandingPage() {
  renderNavbar("home");
  renderFooter();
  resetMessage();
  loadManagedDomains();
  refreshDomainCount();

  const form = document.getElementById("subdomain-form");
  const subdomainInput = document.getElementById("subdomain");
  const checkBtn = document.getElementById("check-btn");
  const resultsContainer = document.getElementById("availability-results");

  if (!form || !subdomainInput || !checkBtn || !resultsContainer) return;

  subdomainInput.addEventListener("input", () => {
    resetMessage();
    clearChildren(resultsContainer);
    setHidden(resultsContainer, true);
  });

  const createModal = document.getElementById("create-modal");
  const createModalDomain = document.getElementById("create-modal-domain");
  const createModalForm = document.getElementById("create-modal-form");
  const createModalIp = document.getElementById("create-modal-ip");
  const createModalSubmit = document.getElementById("create-modal-submit");
  const createModalClose = document.getElementById("create-modal-close");
  const createModalBackdrop = document.querySelector(
    "#create-modal [data-modal-close]"
  );

  let activeCreateContext = null;

  const openCreateModal = (context) => {
    if (!createModal || !createModalDomain || !createModalIp) {
      return;
    }
    activeCreateContext = context;
    createModalDomain.textContent = `${context.subdomain}.${context.domain}`;
    createModalIp.value = "";
    setHidden(createModal, false);
    document.body.classList.add("modal-open");
    setTimeout(() => createModalIp.focus(), 0);
  };

  const closeCreateModal = () => {
    if (!createModal) return;
    activeCreateContext = null;
    setHidden(createModal, true);
    document.body.classList.remove("modal-open");
  };

  resultsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.action === "open-create") {
      const domain = button.dataset.domain;
      const subdomain = button.dataset.subdomain;
      if (!domain || !subdomain) {
        showMessage("Unable to prepare creation form.", "error");
        return;
      }

      const token = getAuthToken();
      if (!token) {
        window.location.href = "login.html";
        return;
      }

      openCreateModal({ domain, subdomain });
      return;
    }

    const targetUrl = button.dataset.target;
    if (targetUrl) {
      window.location.href = targetUrl;
    }
  });

  if (createModalClose) {
    createModalClose.addEventListener("click", closeCreateModal);
  }
  if (createModalBackdrop) {
    createModalBackdrop.addEventListener("click", closeCreateModal);
  }
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      createModal &&
      !createModal.classList.contains("hidden")
    ) {
      closeCreateModal();
    }
  });

  if (createModalForm) {
    createModalForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!activeCreateContext) return;

      const token = getAuthToken();
      if (!token) {
        closeCreateModal();
        window.location.href = "login.html";
        return;
      }

      const ip = (createModalIp?.value || "").trim();
      if (!IPV4_REGEX.test(ip)) {
        showMessage("Enter a valid IPv4 address (e.g. 203.0.113.10).", "error");
        createModalIp?.focus();
        return;
      }

      setButtonLoading(createModalSubmit, "Creating…");

      try {
        await apiFetch("/api/subdomains", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: {
            subdomain: activeCreateContext.subdomain,
            domain: activeCreateContext.domain,
            ip,
          },
        });

        showMessage(
          `Domain ${activeCreateContext.subdomain}.${activeCreateContext.domain} created successfully.`,
          "success"
        );

        const createdButton = resultsContainer.querySelector(
          `button[data-domain="${activeCreateContext.domain}"][data-subdomain="${activeCreateContext.subdomain}"]`
        );
        if (createdButton) {
          delete createdButton.dataset.action;
          createdButton.dataset.target = "dashboard.html";
          createdButton.textContent = "Manage in dashboard";
          const row = createdButton.closest(".result-row");
          const status = row?.querySelector(".status");
          if (row) {
            row.classList.remove("available");
            row.classList.add("taken");
          }
          if (status) {
            status.classList.remove("available");
            status.classList.add("taken");
            status.textContent = "Taken";
          }
        }

        closeCreateModal();
        refreshDomainCount();
      } catch (error) {
        showMessage(error.message, "error");
      } finally {
        clearButtonLoading(createModalSubmit);
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const inputValue = subdomainInput.value.trim().toLowerCase();

    if (!inputValue) {
      showMessage("Enter a domain to check.", "error");
      return;
    }

    if (!SUBDOMAIN_REGEX.test(inputValue)) {
      showMessage(
        "Domain names can contain lowercase letters, numbers, and single hyphens only.",
        "error"
      );
      return;
    }

    setButtonLoading(checkBtn, "Checking…");
    clearChildren(resultsContainer);
    setHidden(resultsContainer, true);

    try {
      const data = await apiFetch("/api/check-availability", {
        method: "POST",
        body: { subdomain: inputValue },
      });

      const results = Array.isArray(data?.results) ? data.results : [];

      if (!results.length) {
        showMessage("No availability data returned.", "info");
        return;
      }

      const fragment = document.createDocumentFragment();
      results.forEach((result) => {
        fragment.appendChild(createAvailabilityRow(result));
      });

      resultsContainer.appendChild(fragment);
      setHidden(resultsContainer, false);
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      clearButtonLoading(checkBtn);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const initializers = [
    { selector: "#login-form", init: initializeLoginPage },
    { selector: "#signup-form", init: initializeSignupPage },
    { selector: "#dashboard-section", init: initializeDashboardPage },
    { selector: "#subdomain-form", init: initializeLandingPage },
  ];

  let initialized = false;

  for (const { selector, init } of initializers) {
    if (document.querySelector(selector)) {
      init();
      initialized = true;
      break;
    }
  }

  if (!initialized) {
    const active = document.body?.dataset?.page || "home";
    renderNavbar(active);
    renderFooter();
  }
});
