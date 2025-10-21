// public/script.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("subdomain-form");
  const subdomainInput = document.getElementById("subdomain");
  const createSection = document.getElementById("create-section");
  const manageSection = document.getElementById("manage-section");
  const updateSection = document.getElementById("update-section");

  const createIpInput = document.getElementById("create-ip");
  const createPasswordInput = document.getElementById("create-password");
  const managePasswordInput = document.getElementById("manage-password");
  const updateIpInput = document.getElementById("update-ip");

  const checkBtn = document.getElementById("check-btn");
  const createBtn = document.getElementById("create-btn");
  const manageCheckBtn = document.getElementById("manage-check-btn");
  const updateBtn = document.getElementById("update-btn");
  const deleteBtn = document.getElementById("delete-btn");
  const messageBox = document.getElementById("form-message");
  const domainIndicator = document.getElementById("domain-count");
  const DEFAULT_MESSAGE =
    (messageBox && messageBox.dataset.defaultMessage) ||
    "Get your free custom subdomain instantly.";

  const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const IP_REGEX = /^\d{1,3}(?:\.\d{1,3}){3}$/;

  const state = {
    subdomain: "",
    exists: false,
    verified: false,
    currentIp: "",
    password: "",
  };

  form.addEventListener("submit", handleCheck);
  subdomainInput.addEventListener("input", handleSubdomainChange);
  createBtn.addEventListener("click", handleCreate);
  manageCheckBtn.addEventListener("click", handleVerify);
  updateBtn.addEventListener("click", handleUpdate);
  deleteBtn.addEventListener("click", handleDelete);

  function handleCheck(event) {
    event.preventDefault();

    const rawValue = subdomainInput.value.trim().toLowerCase();
    subdomainInput.value = rawValue;

    if (!rawValue) {
      showMessage("Please enter a subdomain.", "error");
      return;
    }

    if (!SUBDOMAIN_REGEX.test(rawValue)) {
      showMessage(
        "Subdomains must use lowercase letters, numbers, and hyphens (no leading or trailing hyphen).",
        "error"
      );
      return;
    }

    hideMessage();
    setButtonLoading(checkBtn, "Checking...");

    fetch(`/api/subdomains/${encodeURIComponent(rawValue)}`)
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            data.error || "Failed to check subdomain availability."
          );
        }
        return response.json();
      })
      .then((data) => {
        state.subdomain = rawValue;
        state.exists = Boolean(data.exists);
        state.verified = false;
        state.currentIp = data.ip || "";
        state.password = "";

        hideElement(createSection);
        hideElement(manageSection);
        hideElement(updateSection);

        if (state.exists) {
          showMessage(
            "This subdomain is already in use. Please enter your password to manage it.",
            "error"
          );
          managePasswordInput.value = "";
          showElement(manageSection);
          managePasswordInput.focus();
        } else {
          showMessage("Good news! This subdomain is available.", "success");
          createIpInput.value = "";
          createPasswordInput.value = "";
          showElement(createSection);
          createIpInput.focus();
        }
        hideElement(checkBtn);
      })
      .catch((error) => {
        showMessage(error.message, "error");
      })
      .finally(() => clearButtonLoading(checkBtn));
  }

  function handleCreate() {
    if (!state.subdomain) {
      showMessage("Check the subdomain first.", "error");
      return;
    }

    if (!SUBDOMAIN_REGEX.test(state.subdomain)) {
      showMessage("That subdomain format isn’t valid.", "error");
      return;
    }

    const ip = createIpInput.value.trim();
    const password = createPasswordInput.value.trim();

    if (!IP_REGEX.test(ip)) {
      showMessage("Please enter a valid IPv4 address.", "error");
      return;
    }

    if (!password) {
      showMessage(
        "Please set a password so you can manage this later.",
        "error"
      );
      return;
    }

    hideMessage();
    setButtonLoading(createBtn, "Creating...");

    fetch("/api/subdomains", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subdomain: state.subdomain,
        ip,
        password,
      }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data.error || "Failed to create the subdomain. Please try again."
          );
        }

        state.exists = true;
        state.verified = false;
        state.password = "";
        state.currentIp = ip;

        hideElement(createSection);
        hideElement(manageSection);
        hideElement(updateSection);
        managePasswordInput.value = "";
        updateIpInput.value = "";
        hideElement(checkBtn);

        showMessage(
          `🎉 ${data.domain} is live! Keep your password safe for future edits or removal.`,
          "success"
        );
        refreshDomainCount();
      })
      .catch((error) => {
        showMessage(`Failed: ${error.message}`, "error");
      })
      .finally(() => clearButtonLoading(createBtn));
  }

  function handleVerify() {
    if (!state.subdomain) {
      showMessage("Check the subdomain first.", "error");
      return;
    }

    if (!SUBDOMAIN_REGEX.test(state.subdomain)) {
      showMessage("That subdomain format isn’t valid.", "error");
      return;
    }

    const password = managePasswordInput.value.trim();
    if (!password) {
      showMessage("Please enter your password.", "error");
      return;
    }

    hideMessage();
    setButtonLoading(manageCheckBtn, "Checking...");

    fetch(`/api/subdomains/${encodeURIComponent(state.subdomain)}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Password verification failed.");
        }

        state.exists = true;
        state.verified = true;
        state.password = password;
        state.currentIp = data.ip;

        hideElement(manageSection);
        showElement(updateSection);
        updateIpInput.value = data.ip;

        showMessage(
          "Password confirmed! You can update the IP or delete the record.",
          "success"
        );
      })
      .catch((error) => {
        showMessage(`${error.message}`, "error");
      })
      .finally(() => clearButtonLoading(manageCheckBtn));
  }

  function handleUpdate() {
    if (!state.verified || !state.subdomain) {
      showMessage("Verify the password first.", "error");
      return;
    }

    if (!SUBDOMAIN_REGEX.test(state.subdomain)) {
      showMessage("That subdomain format isn’t valid.", "error");
      return;
    }

    const newIp = updateIpInput.value.trim();
    if (!IP_REGEX.test(newIp)) {
      showMessage("Please enter a valid IPv4 address.", "error");
      return;
    }

    hideMessage();
    setButtonLoading(updateBtn, "Updating...");

    fetch(`/api/subdomains/${encodeURIComponent(state.subdomain)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ip: newIp, password: state.password }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unable to update the IP address.");
        }

        state.currentIp = newIp;
        updateIpInput.value = newIp;
        showMessage("IP updated successfully!", "success");
      })
      .catch((error) => {
        showMessage(`Failed: ${error.message}`, "error");
      })
      .finally(() => clearButtonLoading(updateBtn));
  }

  function handleDelete() {
    if (!state.verified || !state.subdomain) {
      showMessage("Verify the password first before deleting.", "error");
      return;
    }

    if (!SUBDOMAIN_REGEX.test(state.subdomain)) {
      showMessage("That subdomain format isn’t valid.", "error");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to delete this subdomain?"
    );

    if (!confirmed) {
      return;
    }

    hideMessage();
    setButtonLoading(deleteBtn, "Deleting...");

    fetch(`/api/subdomains/${encodeURIComponent(state.subdomain)}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: state.password }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to delete the subdomain.");
        }

        showMessage("Subdomain deleted successfully.", "success");

        state.exists = false;
        state.verified = false;
        state.password = "";
        state.currentIp = "";

        showElement(checkBtn);
        hideElement(createSection);
        hideElement(manageSection);
        hideElement(updateSection);
        refreshDomainCount();
      })
      .catch((error) => {
        showMessage(`Failed: ${error.message}`, "error");
      })
      .finally(() => clearButtonLoading(deleteBtn));
  }

  function handleSubdomainChange() {
    state.subdomain = "";
    state.exists = false;
    state.verified = false;
    state.currentIp = "";
    state.password = "";

    showElement(checkBtn);
    hideElement(createSection);
    hideElement(manageSection);
    hideElement(updateSection);
    clearButtonLoading(checkBtn);
  }

  function showMessage(message, type = "info") {
    if (!messageBox) {
      return;
    }
    messageBox.textContent = message;
    messageBox.className = "message-box ticker show";
    messageBox.classList.add(type);
    triggerTickerAnimation();
  }

  function hideMessage() {
    if (!messageBox) {
      return;
    }
    messageBox.textContent = DEFAULT_MESSAGE;
    messageBox.className = "message-box ticker show info";
    triggerTickerAnimation();
  }

  function triggerTickerAnimation() {
    if (!messageBox) {
      return;
    }
    messageBox.classList.remove("ticker-animate");
    // Force reflow so the animation can restart.
    void messageBox.offsetWidth;
    messageBox.classList.add("ticker-animate");
  }

  function refreshDomainCount({ indicate = false } = {}) {
    if (!domainIndicator) {
      return;
    }

    if (indicate || !domainIndicator.textContent.trim()) {
      domainIndicator.textContent = "Loading active domains...";
    }

    fetch("/api/stats/active-domains")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch active domains");
        }
        return response.json();
      })
      .then((data) => {
        const count = Number(data.activeDomains);
        domainIndicator.textContent = Number.isFinite(count)
          ? `Active Domains: ${count}`
          : "Active Domains: --";
      })
      .catch(() => {
        domainIndicator.textContent = "Active Domains: --";
      });
  }

  function setButtonLoading(button, label) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.disabled = true;
    button.textContent = label;
  }

  function clearButtonLoading(button) {
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
    button.disabled = false;
  }

  function showElement(element) {
    element.classList.remove("hidden");
  }

  function hideElement(element) {
    if (!element.classList.contains("hidden")) {
      element.classList.add("hidden");
    }
  }

  hideMessage();
  refreshDomainCount({ indicate: true });
});
