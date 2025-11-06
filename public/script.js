const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
const HOSTNAME_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}\.?$/i;

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

function showLoader() {
  const element = ensureLoader();
  loaderCount += 1;
  element.classList.add("show");
}

function hideLoader() {
  if (loaderCount > 0) {
    loaderCount -= 1;
  }
  if (loaderCount === 0 && loaderElement) {
    loaderElement.classList.remove("show");
  }
}

function formatDomainList(domains = []) {
  return domains.join(", ");
}

function logoutAndRedirect(target = "index.html") {
  localStorage.removeItem("token");
  window.location.href = target;
}

function normalizeRecordType(type = "A") {
  const upper = String(type || "A").trim().toUpperCase();
  return upper === "CNAME" ? "CNAME" : "A";
}

function sanitizeHostname(value) {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "");
}

function validateRecordValue(recordType, value, context = {}) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return { valid: false, message: "Enter a record value." };
  }

  if (recordType === "A") {
    if (!IPV4_REGEX.test(trimmed)) {
      return {
        valid: false,
        message: "Use a valid IPv4 address (e.g. 203.0.113.10).",
      };
    }
    return { valid: true, value: trimmed };
  }

  const target = sanitizeHostname(trimmed);
  if (!HOSTNAME_REGEX.test(target)) {
    return {
      valid: false,
      message: "Use a valid hostname (e.g. app.example.com).",
    };
  }

  if (context?.subdomain && context?.domain) {
    const full = `${context.subdomain}.${context.domain}`.toLowerCase();
    if (target === full.replace(/\.$/, "")) {
      return {
        valid: false,
        message: "CNAME target cannot point to itself.",
      };
    }
  }

  return { valid: true, value: target };
}

const RECORD_TYPE_UI = {
  A: {
    label: "A record (IPv4)",
    placeholder: "e.g. 203.0.113.10",
    helper: "Maps this domain to an IPv4 address.",
    inputMode: "decimal",
    detailLabel: "IPv4 address",
    tooltip:
      "The A record maps this domain to a specific IPv4 address so browsers know where to connect.",
    tooltipLabel: "Learn about A records",
  },
  CNAME: {
    label: "CNAME target",
    placeholder: "e.g. app.example.com",
    helper: "Points this domain to another hostname.",
    inputMode: "url",
    detailLabel: "Canonical hostname",
    tooltip:
      "The CNAME record aliases this domain to another hostname. The target must already resolve to the right service.",
    tooltipLabel: "Learn about CNAME records",
  },
};

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
    '<nav class="site-nav" aria-label="Primary"><div class="nav-left"><a href="index.html" class="nav-logo" aria-label="Sitey Home"><img src="sitey_logo.png" alt="sitey.one logo" width="28" height="28" decoding="async" fetchpriority="high" /><span class="nav-brand">SITEY</span></a></div><div class="nav-center">';

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
  if (result.isAvailable) {
    if (isLoggedIn) {
      actionButton.dataset.action = "open-create";
      actionButton.dataset.domain = result.domain;
      actionButton.dataset.subdomain = result.subdomain;
      actionButton.textContent = "Create domain";
    } else {
      actionButton.dataset.target = "login.html";
      actionButton.textContent = "Create domain";
    }
  } else {
    actionButton.textContent = "Unavailable";
    actionButton.disabled = true;
    actionButton.tabIndex = -1;
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
        data?.message ||
        "Sign-up successful. Please check your email to verify your account.";
      showMessage(message, "success");
      form.reset();
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
    const recordType = normalizeRecordType(item.record_type || item.recordType);
    const recordConfig = RECORD_TYPE_UI[recordType] || RECORD_TYPE_UI.A;
    const recordValue =
      item.record_value ?? item.recordValue ?? item.ip ?? "";
    wrapper.dataset.recordType = recordType;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "dashboard-item-header";
    header.setAttribute("aria-expanded", "false");

    const headerContent = document.createElement("div");
    headerContent.className = "dashboard-item-title";

    const domainName = document.createElement("span");
    domainName.className = "domain-name";
    domainName.textContent = `${item.subdomain}.${item.domain_name}`;

    const typeBadge = document.createElement("span");
    typeBadge.className = `record-type-badge type-${recordType.toLowerCase()}`;
    typeBadge.textContent = recordType;

    const domainGroup = document.createElement("div");
    domainGroup.className = "dashboard-item-domain";
    domainGroup.appendChild(domainName);
    domainGroup.appendChild(typeBadge);

    const valueDisplay = document.createElement("span");
    valueDisplay.className = "record-value";
    valueDisplay.textContent = recordValue;

    headerContent.appendChild(domainGroup);
    headerContent.appendChild(valueDisplay);

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

    const valueLabel = document.createElement("label");
    const inputId = `dashboard-record-${index}`;
    valueLabel.setAttribute("for", inputId);
    valueLabel.textContent = recordConfig.detailLabel;

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.id = inputId;
    valueInput.className = "dashboard-record-input";
    valueInput.value = recordValue;
    valueInput.placeholder = recordConfig.placeholder;
    valueInput.autocomplete = "off";
    valueInput.autocapitalize = "none";
    valueInput.spellcheck = false;
    valueInput.inputMode = recordConfig.inputMode;

    field.appendChild(valueLabel);
    field.appendChild(valueInput);

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
      const input = detail.querySelector(".dashboard-record-input");
      requestAnimationFrame(() => {
        input?.focus();
      });
    }
  }

  async function fetchSubdomains() {
    showLoader();
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
    } finally {
      hideLoader();
    }
  }

  async function handleUpdate(button) {
    if (!button) return;

    const item = button.closest(".dashboard-item");
    if (!item) return;

    const subdomain = item.dataset.subdomain;
    const domain = item.dataset.domain;
    const recordType = normalizeRecordType(item.dataset.recordType);
    const valueInput = item.querySelector(".dashboard-record-input");
    const newValue = valueInput?.value;

    if (!subdomain || !domain || !valueInput) return;

    const validation = validateRecordValue(recordType, newValue, {
      subdomain,
      domain,
    });
    if (!validation.valid) {
      showMessage(validation.message, "error");
      valueInput.focus();
      valueInput.select?.();
      return;
    }
    const recordValue = validation.value;
    valueInput.value = recordValue;

    setButtonLoading(button, "Updating…");
    showLoader();
    try {
      await apiFetch(`/api/subdomains/${encodeURIComponent(subdomain)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: { value: recordValue, domain },
      });

      const successMessage = `${recordType} record for ${subdomain}.${domain} updated successfully.`;
      showMessage(successMessage, "success");

      const valueDisplay = item.querySelector(
        ".dashboard-item-header .record-value"
      );
      if (valueDisplay) {
        valueDisplay.textContent = recordValue;
      }
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      clearButtonLoading(button);
      hideLoader();
    }
  }

  async function handleDelete(button) {
    if (!button) return;

    const item = button.closest(".dashboard-item");
    if (!item) return;

    const subdomain = item.dataset.subdomain;
    const domain = item.dataset.domain;
    const recordType = normalizeRecordType(item.dataset.recordType);
    if (!subdomain || !domain) return;

    const confirmed = window.confirm(
      `Delete ${recordType} record for ${subdomain}.${domain}? This cannot be undone.`
    );
    if (!confirmed) return;

    setButtonLoading(button, "Deleting…");
    showLoader();
    try {
      await apiFetch(`/api/subdomains/${encodeURIComponent(subdomain)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: { domain },
      });

      const successMessage = `${recordType} record for ${subdomain}.${domain} deleted successfully.`;
      showMessage(successMessage, "success");
      await fetchSubdomains();
      refreshDomainCount();
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      clearButtonLoading(button);
      hideLoader();
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
  const createModalType = document.getElementById("create-modal-type");
  const createModalValue = document.getElementById("create-modal-value");
  const createModalValueLabel = document.getElementById(
    "create-modal-value-label"
  );
  const createModalHelper = document.getElementById("create-modal-helper");
  const createModalTypeInfoBtn = document.getElementById(
    "create-modal-type-info"
  );
  const createModalTypeTooltip = document.getElementById(
    "create-modal-type-tooltip"
  );
  const createModalSubmit = document.getElementById("create-modal-submit");
  const createModalClose = document.getElementById("create-modal-close");
  const createModalBackdrop = document.querySelector(
    "#create-modal [data-modal-close]"
  );

  let isTypeTooltipOpen = false;

  function openTypeTooltip() {
    if (!createModalTypeInfoBtn || !createModalTypeTooltip) return;
    createModalTypeTooltip.classList.add("show");
    createModalTypeInfoBtn.setAttribute("aria-expanded", "true");
    isTypeTooltipOpen = true;
  }

  function closeTypeTooltip() {
    if (!createModalTypeInfoBtn || !createModalTypeTooltip) return;
    createModalTypeTooltip.classList.remove("show");
    createModalTypeInfoBtn.setAttribute("aria-expanded", "false");
    isTypeTooltipOpen = false;
  }

  function applyCreateModalType(type) {
    const config = RECORD_TYPE_UI[type] || RECORD_TYPE_UI.A;
    closeTypeTooltip();
    if (createModalValueLabel) {
      createModalValueLabel.textContent = config.label;
    }
    if (createModalValue) {
      createModalValue.placeholder = config.placeholder;
      createModalValue.setAttribute("inputmode", config.inputMode);
    }
    if (createModalHelper) {
      createModalHelper.textContent = config.helper;
    }
    if (createModalTypeTooltip && typeof config.tooltip === "string") {
      createModalTypeTooltip.textContent = config.tooltip;
    }
    if (createModalTypeInfoBtn) {
      const ariaLabel = config.tooltipLabel || `Learn about ${type} records`;
      createModalTypeInfoBtn.setAttribute("aria-label", ariaLabel);
      createModalTypeInfoBtn.setAttribute("title", ariaLabel);
    }
  }

  let activeCreateContext = null;
  let currentCreateRecordType = "A";

  const openCreateModal = (context) => {
    if (!createModal || !createModalDomain || !createModalValue) {
      return;
    }
    activeCreateContext = context;
    createModalDomain.textContent = `${context.subdomain}.${context.domain}`;
    const initialType = "A";
    if (createModalType) {
      createModalType.value = initialType;
    }
    applyCreateModalType(initialType);
    if (createModalValue) {
      createModalValue.value = "";
    }
    currentCreateRecordType = initialType;
    closeTypeTooltip();
    setHidden(createModal, false);
    document.body.classList.add("modal-open");
    setTimeout(() => createModalValue.focus(), 0);
  };

  const closeCreateModal = () => {
    if (!createModal) return;
    activeCreateContext = null;
    currentCreateRecordType = "A";
    closeTypeTooltip();
    setHidden(createModal, true);
    document.body.classList.remove("modal-open");
  };

  resultsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;

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

  if (createModalTypeInfoBtn) {
    createModalTypeInfoBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isTypeTooltipOpen) {
        closeTypeTooltip();
      } else {
        openTypeTooltip();
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (!isTypeTooltipOpen) return;
    if (
      createModalTypeInfoBtn?.contains(event.target) ||
      createModalTypeTooltip?.contains(event.target)
    ) {
      return;
    }
    closeTypeTooltip();
  });

  if (createModalType) {
    createModalType.addEventListener("change", () => {
      const type = normalizeRecordType(createModalType.value);
      applyCreateModalType(type);
      if (type !== currentCreateRecordType && createModalValue) {
        createModalValue.value = "";
      }
      currentCreateRecordType = type;
      createModalValue?.focus();
    });
  }

  if (createModalClose) {
    createModalClose.addEventListener("click", closeCreateModal);
  }
  if (createModalBackdrop) {
    createModalBackdrop.addEventListener("click", closeCreateModal);
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (isTypeTooltipOpen) {
        closeTypeTooltip();
      }
      if (createModal && !createModal.classList.contains("hidden")) {
        closeCreateModal();
      }
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

      const recordType = normalizeRecordType(createModalType?.value || currentCreateRecordType);
      const validation = validateRecordValue(
        recordType,
        createModalValue?.value,
        activeCreateContext
      );
      if (!validation.valid) {
        showMessage(validation.message, "error");
        createModalValue?.focus();
        createModalValue?.select?.();
        return;
      }
      const recordValue = validation.value;

      setButtonLoading(createModalSubmit, "Creating…");
      showLoader();

      try {
        await apiFetch("/api/subdomains", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: {
            subdomain: activeCreateContext.subdomain,
            domain: activeCreateContext.domain,
            recordType,
            value: recordValue,
          },
        });

        const successMessage = `${recordType} record for ${activeCreateContext.subdomain}.${activeCreateContext.domain} created successfully.`;
        showMessage(successMessage, "success");

        const createdButton = resultsContainer.querySelector(
          `button[data-domain="${activeCreateContext.domain}"][data-subdomain="${activeCreateContext.subdomain}"]`
        );
        if (createdButton) {
          delete createdButton.dataset.action;
          createdButton.removeAttribute("data-target");
          createdButton.textContent = "Unavailable";
          createdButton.disabled = true;
          createdButton.tabIndex = -1;
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
        hideLoader();
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
    showLoader();
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
      hideLoader();
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
