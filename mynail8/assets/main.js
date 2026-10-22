(() => {
  // ---- ヘッダー（スクロールで下線、スマホメニュー） ----
  const header = document.querySelector('.site-header');
  const floatLine = document.querySelector('.float-line');
  const hero = document.querySelector('.hero');
  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 8);
    floatLine.classList.toggle('show', window.scrollY > hero.offsetHeight * 0.8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const menuBtn = document.querySelector('.menu-btn');
  const nav = document.getElementById('site-nav');
  menuBtn.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') !== 'true';
    menuBtn.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      menuBtn.setAttribute('aria-expanded', 'false');
      nav.classList.remove('open');
    }
  });

  // ---- スクロールでふわっと表示 ----
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // ---- Instagram 埋め込み（ギャラリーが近づいたら読み込む） ----
  const grid = document.getElementById('ig-grid');
  const igIo = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    igIo.disconnect();
    const s = document.createElement('script');
    s.src = 'https://www.instagram.com/embed.js';
    s.async = true;
    document.body.appendChild(s);
  }, { rootMargin: '400px 0px' });
  igIo.observe(grid);

  // ---- 要確認タグの表示切り替え（デモ用） ----
  const qBtn = document.querySelector('.q-toggle');
  qBtn.addEventListener('click', () => {
    const on = document.body.classList.toggle('show-q');
    qBtn.setAttribute('aria-pressed', String(on));
    qBtn.textContent = on ? '確認が必要な項目を隠す' : '確認が必要な項目を表示';
  });
})();
