"""本番公開用の仕上げ（何度実行しても同じ結果になる）

- デモ表示の帯と「要確認」タグを外す
- canonical / hreflang / OGP を本番ドメインの絶対URLにする
- ファビコン・apple-touch-icon・OGP画像へのリンクを入れる
- sitemap.xml / robots.txt を書き出す

使い方: python3 tools/finalize.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent / "public"
SITE = "https://bien-manger.jp"
PAGES = ["", "cuisine/", "space/", "chef/", "guide/"]

DEMO_BAR = re.compile(r'<div class="demo-bar" role="note">.*?</div>\n*', re.S)
Q_TAG = re.compile(r'<span class="q">[^<]*</span>')
HEAD_BLOCK_START = "<!-- seo:start -->"
HEAD_BLOCK_END = "<!-- seo:end -->"


def head_block(path, lang):
    ja_url = f"{SITE}/{path}"
    en_url = f"{SITE}/en/{path}"
    url = ja_url if lang == "ja" else en_url
    locale = "ja_JP" if lang == "ja" else "en_US"
    return "\n".join([
        HEAD_BLOCK_START,
        f'  <link rel="canonical" href="{url}">',
        f'  <link rel="alternate" hreflang="ja" href="{ja_url}">',
        f'  <link rel="alternate" hreflang="en" href="{en_url}">',
        f'  <link rel="alternate" hreflang="x-default" href="{ja_url}">',
        '  <link rel="icon" href="/favicon.svg" type="image/svg+xml">',
        '  <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">',
        '  <link rel="apple-touch-icon" href="/apple-touch-icon.png">',
        '  <meta property="og:type" content="website">',
        '  <meta property="og:site_name" content="BIEN MANGER">',
        f'  <meta property="og:url" content="{url}">',
        f'  <meta property="og:locale" content="{locale}">',
        f'  <meta property="og:image" content="{SITE}/assets/og-image.jpg">',
        '  <meta property="og:image:width" content="1200">',
        '  <meta property="og:image:height" content="630">',
        '  <meta name="twitter:card" content="summary_large_image">',
        "  " + HEAD_BLOCK_END,
    ])


def finalize(file, path, lang):
    s = file.read_text(encoding="utf-8")
    s = DEMO_BAR.sub("", s)
    s = Q_TAG.sub("", s)
    # 以前のブロックと、相対URLの hreflang / og:image を取り除いてから入れ直す
    s = re.sub(re.escape(HEAD_BLOCK_START) + r".*?" + re.escape(HEAD_BLOCK_END) + r"\n?", "", s, flags=re.S)
    s = re.sub(r'\s*<link rel="alternate" hreflang="[^"]+" href="[^"]*">', "", s)
    s = re.sub(r'\s*<meta property="og:image" content="[^"]*">', "", s)
    s = s.replace('  <link rel="stylesheet" href="/assets/styles.css">',
                  '  <link rel="stylesheet" href="/assets/styles.css">\n  ' + head_block(path, lang), 1)
    file.write_text(s, encoding="utf-8")


def main():
    for path in PAGES:
        finalize(ROOT / path / "index.html", path, "ja")
        finalize(ROOT / "en" / path / "index.html", path, "en")
    for name in ("404.html", "en/404.html"):
        f = ROOT / name
        if f.exists():
            s = f.read_text(encoding="utf-8")
            s = DEMO_BAR.sub("", Q_TAG.sub("", s))
            f.write_text(s, encoding="utf-8")

    urls = []
    for path in PAGES:
        for lang, prefix in (("ja", ""), ("en", "en/")):
            loc = f"{SITE}/{prefix}{path}"
            urls.append(
                f"  <url>\n    <loc>{loc}</loc>\n"
                f'    <xhtml:link rel="alternate" hreflang="ja" href="{SITE}/{path}"/>\n'
                f'    <xhtml:link rel="alternate" hreflang="en" href="{SITE}/en/{path}"/>\n'
                "  </url>"
            )
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(urls) + "\n</urlset>\n",
        encoding="utf-8",
    )
    (ROOT / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {SITE}/sitemap.xml\n", encoding="utf-8"
    )
    print("finalized")


if __name__ == "__main__":
    main()
