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
