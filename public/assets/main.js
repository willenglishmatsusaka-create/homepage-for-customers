(() => {
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
    feed.posts.slice(0, 9).forEach((post, i) => {
      const a = document.createElement("a");
      a.className = "ig-item reveal";
      a.href = post.permalink;
      a.target = "_blank";
      a.rel = "noopener";
      a.dataset.track = "instagram_click";
      a.dataset.label = "post";
      if (post.type === "VIDEO") a.classList.add("video");
      // デモでは先頭3件を「固定投稿」として表示（初めての方へ／コースと料金／店内・過ごし方）
      if (feed.demo && i < 3) a.classList.add("pinned");

      if (post.image) {
        const img = document.createElement("img");
        img.src = post.image;
        img.alt = (post.caption || "Instagram の投稿").slice(0, 80);
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
    if (feed.username) follow.textContent = `@${feed.username} をフォローする`;
    status.textContent = feed.demo
      ? "※デモ表示です。Instagram 連携後は実際の最新投稿に自動で切り替わります。"
      : `最終更新 ${fmt(feed.updatedAt)}`;
  };

  fetch("/api/instagram")
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(render)
    .catch(() => {
      status.textContent = "Instagram の投稿を読み込めませんでした。";
    });
})();
