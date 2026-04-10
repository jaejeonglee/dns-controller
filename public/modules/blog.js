import { t } from "./i18n.js";
import { navigateTo } from "./router.js";

const MANAGED_DOMAIN = "sitey.one";

function renderDomainChip(name) {
  return `<button type="button" class="domain-chip" data-name="${name}">${name}.${MANAGED_DOMAIN}</button>`;
}

function renderDomainGroup(names) {
  return `<div class="domain-chip-group">${names.map(renderDomainChip).join("")}</div>`;
}

const portfolioNames = [
  "me", "folio", "hi", "myself", "iam", "hello", "portfolio", "work",
  "showcase", "resume", "cv", "about", "profile", "intro", "studio",
];

const blogNames = [
  "blog", "journal", "notes", "writes", "thoughts", "diary", "words",
  "stories", "posts", "log", "musings", "chronicle",
];

const startupNames = [
  "app", "labs", "lab", "studio", "works", "build", "ship", "make",
  "try", "beta", "co", "group", "inc", "team", "hq",
];

const sideProjectNames = [
  "hack", "play", "test", "experiment", "wip", "draft", "sandbox",
  "prototype", "demo", "poc", "mvp", "side", "weekend", "hobby",
];

const devNames = [
  "dev", "code", "codes", "stack", "byte", "bit", "api", "git",
  "repo", "ship", "deploy", "cli", "build", "compile", "runtime",
];

const aiNames = [
  "ai", "bot", "gpt", "llm", "agent", "ml", "neural", "prompt",
  "chat", "assist", "brain", "smart", "auto",
];

const creativeNames = [
  "pixel", "dot", "cube", "loop", "wave", "spark", "glow", "nova",
  "lumen", "flare", "drift", "echo", "vibe", "haven", "orbit",
];

export function initializeBlogPage() {
  const container = document.getElementById("blog-content");
  if (!container) return;

  container.innerHTML = `
    <header class="blog-header">
      <h1>${t("blog.title")}</h1>
      <p class="blog-meta">${t("blog.meta")}</p>
      <p class="blog-intro">${t("blog.intro")}</p>
    </header>

    <section class="blog-section">
      <h2>${t("blog.why.title")}</h2>
      <p>${t("blog.why.body")}</p>
      <ul>
        <li><strong>${t("blog.why.tip1.title")}</strong> — ${t("blog.why.tip1.desc")}</li>
        <li><strong>${t("blog.why.tip2.title")}</strong> — ${t("blog.why.tip2.desc")}</li>
        <li><strong>${t("blog.why.tip3.title")}</strong> — ${t("blog.why.tip3.desc")}</li>
        <li><strong>${t("blog.why.tip4.title")}</strong> — ${t("blog.why.tip4.desc")}</li>
      </ul>
    </section>

    <section class="blog-section">
      <h2>${t("blog.portfolio.title")}</h2>
      <p>${t("blog.portfolio.body")}</p>
      ${renderDomainGroup(portfolioNames)}
    </section>

    <section class="blog-section">
      <h2>${t("blog.blog.title")}</h2>
      <p>${t("blog.blog.body")}</p>
      ${renderDomainGroup(blogNames)}
    </section>

    <section class="blog-section">
      <h2>${t("blog.startup.title")}</h2>
      <p>${t("blog.startup.body")}</p>
      ${renderDomainGroup(startupNames)}
    </section>

    <section class="blog-section">
      <h2>${t("blog.side.title")}</h2>
      <p>${t("blog.side.body")}</p>
      ${renderDomainGroup(sideProjectNames)}
    </section>

    <section class="blog-section">
      <h2>${t("blog.dev.title")}</h2>
      <p>${t("blog.dev.body")}</p>
      ${renderDomainGroup(devNames)}
    </section>

    <section class="blog-section">
      <h2>${t("blog.ai.title")}</h2>
      <p>${t("blog.ai.body")}</p>
      ${renderDomainGroup(aiNames)}
    </section>

    <section class="blog-section">
      <h2>${t("blog.creative.title")}</h2>
      <p>${t("blog.creative.body")}</p>
      ${renderDomainGroup(creativeNames)}
    </section>

    <section class="blog-section">
      <h2>${t("blog.cta.title")}</h2>
      <p>${t("blog.cta.body")}</p>
      <button type="button" class="primary-button blog-cta-btn" id="blog-cta-btn">${t("blog.cta.button")}</button>
    </section>
  `;

  // Click handlers
  container.addEventListener("click", (e) => {
    const chip = e.target.closest(".domain-chip");
    if (chip) {
      const name = chip.dataset.name;
      navigateTo(`/?check=${encodeURIComponent(name)}`);
      return;
    }

    if (e.target.closest("#blog-cta-btn")) {
      navigateTo("/");
    }
  });
}
