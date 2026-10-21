document.documentElement.classList.add('js');

// スマートフォンのメニュー開閉
const menuBtn = document.querySelector('.menu-btn');
const nav = document.getElementById('site-nav');

if (menuBtn && nav) {
  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  // メニュー内のリンクを押したら閉じる
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
}

// スクロールしたらヘッダーに影を付ける
const header = document.querySelector('.site-header');
const onScroll = () => header && header.classList.toggle('is-scrolled', window.scrollY > 40);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// スクロールで要素を順に表示する
const targets = document.querySelectorAll(
  '.section .eyebrow, .section h2, .section-lead, .industry, .feature, .steps li, .price-card, .monitor, .case > *, .faq details, .word, .philosophy-body p, .contact-actions'
);

if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  targets.forEach((el) => {
    el.classList.add('reveal');
    // 同じ並びのカードは少しずつずらして出す
    const siblings = [...el.parentElement.children].filter((c) => c.matches(el.tagName));
    el.style.transitionDelay = `${Math.min(siblings.indexOf(el), 5) * 0.08}s`;
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
        // 表示が終わったら遅延を外し、ふれたときの動きを素早くする
        setTimeout(() => { entry.target.style.transitionDelay = ''; }, 1400);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  targets.forEach((el) => io.observe(el));
} else {
  document.documentElement.classList.add('no-motion');
  targets.forEach((el) => el.classList.add('is-visible'));
}
