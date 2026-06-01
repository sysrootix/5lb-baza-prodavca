/* =========================================================
   5LB · База знаний — interactions
   ========================================================= */
(function () {
  "use strict";

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Header scroll state + reading progress ---------- */
  const header = $("#header");
  const progressBar = $("#progressBar");
  const toTop = $("#toTop");

  function onScroll() {
    const y = window.scrollY || document.documentElement.scrollTop;
    header.classList.toggle("is-scrolled", y > 8);

    const docH = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docH > 0 ? (y / docH) * 100 : 0;
    progressBar.style.width = pct.toFixed(2) + "%";

    toTop.classList.toggle("is-visible", y > 700);
    if (y > 700) toTop.removeAttribute("hidden");
  }

  /* ---------- Mobile nav ---------- */
  const burger = $("#burger");
  const nav = $("#primaryNav");

  function closeNav() {
    nav.classList.remove("is-open");
    burger.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-open");
  }
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-open", open);
  });
  $$(".nav__link", nav).forEach((a) => a.addEventListener("click", closeNav));

  /* ---------- Scroll-spy ---------- */
  const navLinks = $$(".nav__link");
  const linkById = {};
  navLinks.forEach((a) => {
    const id = a.getAttribute("href").slice(1);
    linkById[id] = a;
  });
  const spyTargets = navLinks
    .map((a) => document.getElementById(a.getAttribute("href").slice(1)))
    .filter(Boolean);

  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          navLinks.forEach((l) => l.classList.remove("is-active"));
          const link = linkById[e.target.id];
          if (link) link.classList.add("is-active");
        }
      });
    },
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );
  spyTargets.forEach((t) => spy.observe(t));

  /* ---------- Accordions ---------- */
  $$(".acc").forEach((acc, i) => {
    const head = $(".acc__head", acc);
    const panel = $(".acc__panel", acc);
    if (panel) {
      if (!panel.id) panel.id = "acc-panel-" + i;
      head.setAttribute("aria-controls", panel.id);
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-hidden", "true");
    }
    head.addEventListener("click", () => {
      const open = acc.classList.toggle("is-open");
      head.setAttribute("aria-expanded", String(open));
      if (panel) panel.setAttribute("aria-hidden", String(!open));
    });
  });

  /* ---------- Scroll reveal ---------- */
  const reveals = $$(".reveal");
  if (prefersReduced) {
    reveals.forEach((el) => el.classList.add("is-in"));
  } else {
    const ro = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e, i) => {
          if (e.isIntersecting) {
            const delay = Math.min(i * 60, 240);
            setTimeout(() => e.target.classList.add("is-in"), delay);
            obs.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    reveals.forEach((el) => ro.observe(el));
  }

  /* ---------- Back to top ---------- */
  toTop.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" })
  );

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Theme toggle (light / dark) ---------- */
  const themeToggle = $("#themeToggle");
  const root = document.documentElement;
  const themeColorMeta = $('meta[name="theme-color"]');

  function applyTheme(theme) {
    root.classList.add("theme-switching");
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    if (themeColorMeta) themeColorMeta.setAttribute("content", theme === "dark" ? "#15110D" : "#FF6600");
    if (themeToggle) themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    // drop the no-transition guard next frame
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { localStorage.setItem("5lb-theme", next); } catch (e) {}
      applyTheme(next);
    });
    themeToggle.setAttribute("aria-pressed", String(root.getAttribute("data-theme") === "dark"));
  }

  // follow OS theme changes only if the user hasn't chosen manually
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))((e) => {
    let saved = null;
    try { saved = localStorage.getItem("5lb-theme"); } catch (err) {}
    if (!saved) applyTheme(e.matches ? "dark" : "light");
  });

  /* ---------- Service worker (offline / installable) ---------- */
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  /* =========================================================
     SEARCH across the knowledge base
     ========================================================= */
  const searchToggle = $("#searchToggle");
  const searchPanel  = $("#searchPanel");
  const searchInput  = $("#searchInput");
  const searchCount  = $("#searchCount");
  const searchClose  = $("#searchClose");
  const searchPrev   = $("#searchPrev");
  const searchNext   = $("#searchNext");
  const main = $("#top");

  let hits = [];
  let current = -1;
  let debounce = null;

  function openSearch() {
    searchPanel.hidden = false;
    searchToggle.setAttribute("aria-expanded", "true");
    setTimeout(() => searchInput.focus(), 30);
  }
  function closeSearch() {
    clearHighlights();
    searchPanel.hidden = true;
    searchToggle.setAttribute("aria-expanded", "false");
    searchInput.value = "";
    searchCount.textContent = "";
  }
  searchToggle.addEventListener("click", () =>
    searchPanel.hidden ? openSearch() : closeSearch()
  );
  searchClose.addEventListener("click", closeSearch);

  function clearHighlights() {
    $$("mark.search-hit", main).forEach((m) => {
      const parent = m.parentNode;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    });
    hits = [];
    current = -1;
  }

  function runSearch(query) {
    clearHighlights();
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      searchCount.textContent = "";
      return;
    }

    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.nodeName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "MARK") return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest("[hidden]")) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.toLowerCase().includes(q)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);

    targets.forEach((node) => {
      const text = node.nodeValue;
      const lower = text.toLowerCase();
      const frag = document.createDocumentFragment();
      let idx = 0, pos;
      while ((pos = lower.indexOf(q, idx)) !== -1) {
        if (pos > idx) frag.appendChild(document.createTextNode(text.slice(idx, pos)));
        const mark = document.createElement("mark");
        mark.className = "search-hit";
        mark.textContent = text.slice(pos, pos + q.length);
        frag.appendChild(mark);
        idx = pos + q.length;
      }
      if (idx < text.length) frag.appendChild(document.createTextNode(text.slice(idx)));
      node.parentNode.replaceChild(frag, node);
    });

    hits = $$("mark.search-hit", main);
    if (!hits.length) {
      searchCount.textContent = "0 совпадений";
      return;
    }
    current = -1;
    goTo(0);
  }

  function goTo(i) {
    if (!hits.length) return;
    if (current >= 0 && hits[current]) hits[current].classList.remove("is-current");
    current = (i + hits.length) % hits.length;
    const el = hits[current];
    el.classList.add("is-current");
    searchCount.textContent = `${current + 1} из ${hits.length}`;

    // expand parent accordion if hit is hidden inside it
    const acc = el.closest && el.closest(".acc");
    if (acc && !acc.classList.contains("is-open")) {
      acc.classList.add("is-open");
      $(".acc__head", acc).setAttribute("aria-expanded", "true");
      const ph = $(".acc__panel", acc);
      if (ph) ph.setAttribute("aria-hidden", "false");
    }
    el.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });
  }

  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounce);
    const v = e.target.value;
    debounce = setTimeout(() => runSearch(v), 180);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.shiftKey ? goTo(current - 1) : goTo(current + 1);
    } else if (e.key === "Escape") {
      closeSearch();
    }
  });
  searchNext.addEventListener("click", () => goTo(current + 1));
  searchPrev.addEventListener("click", () => goTo(current - 1));

  // global shortcuts: "/" or Ctrl/Cmd+K open search, Esc closes
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.nodeName);
    if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      searchPanel.hidden ? openSearch() : searchInput.focus();
    }
    if (e.key === "Escape" && !searchPanel.hidden) closeSearch();
  });
})();
