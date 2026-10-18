(() => {
  const EN = document.documentElement.lang === "en";
  const t = EN
    ? { photo: "Photo", post: "Instagram post", fromIg: "From Instagram",
        demo: "Demo: the latest Instagram posts will appear here automatically.",
        failed: "Instagram posts could not be loaded." }
    : { photo: "写真", post: "Instagram の投稿", fromIg: "Instagram より",
        demo: "デモ表示：連携後は最新の投稿が自動で表示されます。",
        failed: "Instagram の投稿を読み込めませんでした。" };

  // ---- スクロール表示 ----
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      }, { rootMargin: "0px 0px -8% 0px" })
    : null;
  const observe = (el) => (io ? io.observe(el) : el.classList.add("is-in"));
  document.querySelectorAll(".reveal").forEach(observe);

  // ---- 写真：画像ファイルが読み込めた枠だけ「仮の枠」表示を外す ----
  document.querySelectorAll(".photo").forEach((fig) => {
    const m = /url\(['"]?([^'")]+)/.exec(fig.style.getPropertyValue("--img"));
    if (!m) return;
    const img = new Image();
    img.onload = () => fig.classList.add("has-img");
    img.src = m[1];
  });

  // ---- トップのカルーセル ----
  const hero = {
    root: document.getElementById("hero-slides"),
    dots: document.getElementById("hero-dots"),
    index: 0,
    timer: null,
  };
  const slides = () => [...hero.root.querySelectorAll(".hero-slide")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const show = (i) => {
    const all = slides();
    hero.index = (i + all.length) % all.length;
    all.forEach((el, n) => el.classList.toggle("is-active", n === hero.index));
    [...hero.dots.children].forEach((d, n) => d.setAttribute("aria-selected", String(n === hero.index)));
  };
  const play = () => {
    clearInterval(hero.timer);
    if (!reduceMotion) hero.timer = setInterval(() => show(hero.index + 1), 3500);
  };
  const buildDots = () => {
    hero.dots.textContent = "";
    slides().forEach((el, n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-label", el.querySelector("figcaption")?.textContent || `${t.photo} ${n + 1}`);
      b.addEventListener("click", () => { show(n); play(); });
      hero.dots.append(b);
    });
    show(hero.index);
  };
  if (hero.root) {
    buildDots();
    play();
    document.querySelectorAll(".hero-arrow").forEach((b) =>
      b.addEventListener("click", () => { show(hero.index + Number(b.dataset.dir)); play(); }));
    const section = hero.root.closest(".hero");
    section.addEventListener("mouseenter", () => clearInterval(hero.timer));
    section.addEventListener("mouseleave", play);
    let startX = null;
    section.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
    section.addEventListener("touchend", (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) { show(hero.index + (dx < 0 ? 1 : -1)); play(); }
      startX = null;
    });
  }

  // Instagram の最新写真（実データ時のみ）をカルーセルの後ろに足す
  const addInstagramSlides = (feed) => {
    if (!hero.root || feed.demo) return;
    feed.posts.filter((p) => p.image).slice(0, 3).forEach((p) => {
      const fig = document.createElement("figure");
      fig.className = "hero-slide";
      fig.style.setProperty("--img", `url("${p.image}")`);
      const cap = document.createElement("figcaption");
      cap.textContent = t.fromIg;
      fig.append(cap);
      hero.root.append(fig);
    });
    buildDots();
  };

  // ---- 要確認タグの表示切り替え（デモ用） ----
  const qToggle = document.querySelector(".q-toggle");
  if (qToggle) {
    qToggle.addEventListener("click", () => {
      const on = document.body.classList.toggle("show-q");
      qToggle.setAttribute("aria-pressed", String(on));
    });
  }

  // ---- コースの流れ：3枚ずつ見えるカルーセル ----
  document.querySelectorAll("[data-reel]").forEach((reel) => {
    const track = reel.querySelector(".reel-track");
    const step = () => track.firstElementChild.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
    const move = (dir) => {
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      if (dir > 0 && atEnd) track.scrollTo({ left: 0 });
      else track.scrollBy({ left: dir * step() });
    };
    reel.querySelectorAll(".reel-arrow").forEach((b) => b.addEventListener("click", () => move(Number(b.dataset.dir))));
    if (reduceMotion) return;
    let timer = setInterval(() => move(1), 3500);
    const pause = () => clearInterval(timer);
    const resume = () => { clearInterval(timer); timer = setInterval(() => move(1), 3500); };
    reel.addEventListener("mouseenter", pause);
    reel.addEventListener("mouseleave", resume);
    track.addEventListener("touchstart", pause, { passive: true });
    track.addEventListener("touchend", resume);
  });

  // ---- クリック計測（予約・電話・地図・Instagram） ----
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-track]");
    if (!a) return;
    const payload = JSON.stringify({
      name: a.dataset.track,
      label: a.dataset.label || "",
      page: location.pathname,
    });
    try {
      navigator.sendBeacon
        ? navigator.sendBeacon("/api/event", new Blob([payload], { type: "application/json" }))
        : fetch("/api/event", { method: "POST", body: payload, keepalive: true, headers: { "Content-Type": "application/json" } });
    } catch (_) { /* 計測失敗は無視 */ }
  });

  // ---- Instagram ----
  const grid = document.getElementById("ig-grid");
  const status = document.getElementById("ig-status");
  const follow = document.getElementById("ig-follow");
  if (!grid) return;

  const fmt = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  };

  const render = (feed) => {
    grid.textContent = "";
    feed.posts.slice(0, 6).forEach((post, i) => {
      const a = document.createElement("a");
      a.className = "ig-item reveal";
      a.href = post.permalink;
      a.target = "_blank";
      a.rel = "noopener";
      a.dataset.track = "instagram_click";
      a.dataset.label = "post";
      if (post.type === "VIDEO") a.classList.add("video");
      // デモでは先頭3件を「固定投稿」として表示（初めての方へ／コースと料金／店内・過ごし方）

      if (post.image) {
        const img = document.createElement("img");
        img.src = post.image;
        img.alt = (post.caption || t.post).slice(0, 80);
        img.loading = "lazy";
        a.append(img);
      } else {
        a.classList.add("placeholder");
        a.style.background = `radial-gradient(ellipse at ${30 + (i * 17) % 50}% ${25 + (i * 23) % 50}%, hsla(${18 + (i * 9) % 30}, 50%, 32%, .55), transparent 65%), linear-gradient(135deg, #2a221d, #15110f)`;
      }

      const date = document.createElement("span");
      date.className = "ig-date";
      date.textContent = fmt(post.timestamp);
      const cap = document.createElement("span");
      cap.className = "ig-cap";
      cap.textContent = post.caption;
      a.append(date, cap);
      grid.append(a);
      observe(a);
    });

    if (feed.profileUrl) follow.href = feed.profileUrl;
    if (feed.username) follow.textContent = `@${feed.username}`;
    status.textContent = feed.demo ? t.demo : "";
  };

  fetch(`/api/instagram${EN ? "?lang=en" : ""}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((feed) => { render(feed); addInstagramSlides(feed); })
    .catch(() => {
      status.textContent = t.failed;
    });
})();
