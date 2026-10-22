document.documentElement.classList.add('js');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// スマートフォンのメニュー開閉
const menuBtn = document.querySelector('.menu-btn');
const nav = document.getElementById('site-nav');

if (menuBtn && nav) {
  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  menuBtn.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  // メニュー内のリンクを押したら閉じる
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
}

// スクロールに合わせて、ヘッダーの色・右下の相談ボタン・背景写真を動かす
const header = document.querySelector('.site-header');
const hero = document.querySelector('.hero');
const floatCta = document.querySelector('.float-cta');
const contact = document.querySelector('.contact');

const onScroll = () => {
  const y = window.scrollY;
  const heroBottom = hero ? hero.offsetHeight - 80 : 40;
  header?.classList.toggle('is-scrolled', y > heroBottom);
  if (floatCta && contact) {
    const nearContact = contact.getBoundingClientRect().top < window.innerHeight;
    floatCta.classList.toggle('is-shown', y > heroBottom && !nearContact);
  }
  if (contact && !reduceMotion) {
    // 画面内にあるときだけ、背景写真をゆっくりずらす（±40px）
    const r = contact.getBoundingClientRect();
    const ratio = Math.max(-1, Math.min(1, r.top / window.innerHeight));
    contact.style.setProperty('--shift', `${ratio * -40}px`);
  }
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ファーストビューの写真を6秒ごとに切り替える
const slides = [...document.querySelectorAll('.hero-slide')];
const progress = document.querySelector('.hero-progress');

if (slides.length > 1 && !reduceMotion) {
  let current = 0;
  const restartProgress = () => {
    progress?.classList.remove('is-running');
    void progress?.offsetWidth;
    progress?.classList.add('is-running');
  };
  restartProgress();
  setInterval(() => {
    slides[current].classList.remove('is-active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('is-active');
    restartProgress();
  }, 6000);
}

// スクロールで要素を順に表示する
const targets = document.querySelectorAll(
  '.section .eyebrow, .section h2, .section-lead, .intro-grid p, .facts li, .work-text, .industry, .row-text, .timeline, .timeline li, .price-card, .monitor, .faq details, .contact-inner'
);
const imageTargets = document.querySelectorAll('.reveal-img');

if ('IntersectionObserver' in window && !reduceMotion) {
  targets.forEach((el) => {
    el.classList.add('reveal');
    // 同じ並びの要素は少しずつずらして出す
    const siblings = [...el.parentElement.children].filter((c) => c.tagName === el.tagName);
    el.style.transitionDelay = `${Math.min(siblings.indexOf(el), 5) * 0.08}s`;
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
      // 表示が終わったら遅延を外し、ふれたときの動きを素早くする
      setTimeout(() => { entry.target.style.transitionDelay = ''; }, 1600);
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  [...targets, ...imageTargets].forEach((el) => io.observe(el));
} else {
  document.documentElement.classList.add('no-motion');
  [...targets, ...imageTargets].forEach((el) => el.classList.add('is-visible'));
}
