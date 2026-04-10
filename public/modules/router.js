import { initializeLandingPage } from './home.js';
import { initializeLoginPage, initializeSignupPage } from './auth.js';
import { initializeDashboardPage } from './dashboard.js';
import { initializeDocsPage } from './docs.js';
import { renderNavbar, renderFooter, resetMessage } from './ui.js';
import { applyTranslations, loadLang, getLang } from './i18n.js';

function initializeHelpPage() {
  resetMessage();
}

const routes = {
    "/": { templateId: "template-home", init: initializeLandingPage, title: "Sitey - free domain" },
    "/index.html": { templateId: "template-home", init: initializeLandingPage, title: "Sitey - free domain" },
    "/login": { templateId: "template-login", init: initializeLoginPage, title: "Login - Sitey" },
    "/signup": { templateId: "template-signup", init: initializeSignupPage, title: "Sign Up - Sitey" },
    "/dashboard": { templateId: "template-dashboard", init: initializeDashboardPage, title: "Dashboard - Sitey" },
    "/docs": { templateId: "template-docs", init: initializeDocsPage, title: "Docs - Sitey" },
    "/guide": { templateId: "template-docs", init: initializeDocsPage, title: "Docs - Sitey" },
    "/help": { templateId: "template-help", init: initializeHelpPage, title: "Help - Sitey" },
};

export function navigateTo(path) {
  history.pushState(null, null, path);
  router();
}

export async function router() {
  // Normalize path to handle index.html as root
  let path = window.location.pathname;
  if (path.endsWith('/index.html')) {
    path = '/';
  }
  
  const route = routes[path] || routes["/"]; // Default to home

  const appRoot = document.getElementById("app-root");
  if (!appRoot) return;

  const template = document.getElementById(route.templateId);
  if (!template) {
    appRoot.innerHTML = "<h1>Error: Page not found</h1>";
    return;
  }

  // Render view
  appRoot.innerHTML = "";
  appRoot.appendChild(template.content.cloneNode(true));
  document.title = route.title;

  // Render common components and initialize page-specific JS
  renderNavbar(path);
  renderFooter();
  applyTranslations();
  route.init();

  // Wire up language selector
  const langSelect = document.getElementById("lang-select");
  if (langSelect) {
    langSelect.value = getLang();
    langSelect.addEventListener("change", async () => {
      await loadLang(langSelect.value);
      router();
    });
  }
}
