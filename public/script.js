// public/script.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("subdomain-form");
  const resultMessage = document.getElementById("result-message");
  const submitBtn = document.getElementById("submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Loading effect
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating...";

    const subdomain = document.getElementById("subdomain").value;
    const ip = document.getElementById("ip").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/api/subdomains", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subdomain, ip, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "An unknown error occurred.");
      }

      // Success
      displayMessage(`🎉 Success! ${data.domain} has been created.`, "success");
    } catch (error) {
      // Handle network or server errors
      displayMessage(`😭 Failed: ${error.message}`, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });

  function displayMessage(message, type) {
    resultMessage.textContent = message;
    resultMessage.className = type;
    resultMessage.classList.add("show");
  }
});
