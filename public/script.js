import { router, navigateTo } from './modules/router.js';
import { loadInitialTheme } from './modules/theme.js';

document.addEventListener("DOMContentLoaded", () => {
  // Handle client-side routing for all internal links
  document.body.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link && link.target !== "_blank" && link.origin === window.location.origin) {
      event.preventDefault();
      navigateTo(link.pathname);
    }
  });

  // Listen for browser back/forward button clicks
  window.addEventListener("popstate", router);

  // Initial route
  router();

  // Load initial theme
  loadInitialTheme();
});
