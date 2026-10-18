/**
 * BIEN MANGER — Cloudflare Worker
 *
 * - 静的ファイル（public/）の配信
 * - GET  /api/instagram : Instagram の最新投稿（KV にキャッシュ）
 * - POST /api/event     : 予約ボタン等のクリック計測（Analytics Engine）
 * - Cron                : 30分ごとに最新投稿を取得、7日ごとにトークンを更新
 *
 * Instagram のトークン未設定時はデモ用データを返すため、そのまま提案用デモとして動く。
 */

const IG_API = "https://graph.instagram.com";
const IG_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
const FEED_KEY = "ig:feed";
const TOKEN_KEY = "ig:token";
const TOKEN_REFRESHED_KEY = "ig:token_refreshed_at";
const FEED_LIMIT = 12;
const TOKEN_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/instagram" && request.method === "GET") {
      return handleInstagram(env, ctx, url.searchParams.get("lang") === "en" ? "en" : "ja");
    }
    if (url.pathname === "/api/event" && request.method === "POST") {
      return handleEvent(request, env);
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ error: "not_found" }, 404);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await maybeRefreshToken(env);
        await refreshFeed(env);
      })(),
    );
  },
};

async function handleInstagram(env, ctx, lang) {
  const token = await getToken(env);
  if (!token) {
    return json(demoFeed(env, lang), 200, { "Cache-Control": "public, max-age=300" });
  }

  let feed = env.IG_KV ? await env.IG_KV.get(FEED_KEY, "json") : null;
  if (!feed) {
    feed = await refreshFeed(env);
  } else if (Date.now() - Date.parse(feed.updatedAt) > 30 * 60 * 1000) {
    // 古いキャッシュは返しつつ裏で更新（Cron が止まっていても新着が反映される）
    ctx.waitUntil(refreshFeed(env));
  }
  if (!feed) {
    return json(demoFeed(env, lang), 200, { "Cache-Control": "no-store" });
  }
  return json(feed, 200, { "Cache-Control": "public, max-age=300" });
}

async function getToken(env) {
  if (env.IG_KV) {
    const stored = await env.IG_KV.get(TOKEN_KEY);
    if (stored) return stored;
  }
  return env.IG_ACCESS_TOKEN || null;
}

async function refreshFeed(env) {
  const token = await getToken(env);
  if (!token) return null;

  const api = `${IG_API}/me/media?fields=${IG_FIELDS}&limit=${FEED_LIMIT}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(api);
  if (!res.ok) {
    console.error("instagram fetch failed", res.status, await res.text());
    return null;
  }
  const body = await res.json();
  const feed = {
    demo: false,
    username: env.IG_USERNAME || "",
    profileUrl: profileUrl(env),
    updatedAt: new Date().toISOString(),
    posts: (body.data || []).map((p) => ({
      id: p.id,
      type: p.media_type,
      image: p.media_type === "VIDEO" ? p.thumbnail_url : p.media_url,
      caption: p.caption || "",
      permalink: p.permalink,
      timestamp: p.timestamp,
    })),
  };
  if (env.IG_KV) await env.IG_KV.put(FEED_KEY, JSON.stringify(feed));
  return feed;
}

// 長期トークン（60日有効）を定期的に延長して KV に保存する
async function maybeRefreshToken(env) {
  if (!env.IG_KV) return;
  const token = await getToken(env);
  if (!token) return;

  const last = Number((await env.IG_KV.get(TOKEN_REFRESHED_KEY)) || 0);
  if (Date.now() - last < TOKEN_REFRESH_INTERVAL_MS) return;

  const res = await fetch(
    `${IG_API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) {
    console.error("instagram token refresh failed", res.status, await res.text());
    return;
  }
  const { access_token } = await res.json();
  if (access_token) {
    await env.IG_KV.put(TOKEN_KEY, access_token);
    await env.IG_KV.put(TOKEN_REFRESHED_KEY, String(Date.now()));
  }
}

async function handleEvent(request, env) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, 400);
  }
  const name = String(body.name || "").slice(0, 64);
  const label = String(body.label || "").slice(0, 64);
  const page = String(body.page || "").slice(0, 128);
  if (!name) return json({ ok: false }, 400);

  if (env.EVENTS) {
    const ua = request.headers.get("user-agent") || "";
    env.EVENTS.writeDataPoint({
      indexes: [name],
      blobs: [name, label, page, /Mobi/i.test(ua) ? "mobile" : "desktop", request.cf?.country || ""],
      doubles: [1],
    });
  }
  return json({ ok: true });
}

function profileUrl(env) {
  return env.IG_USERNAME ? `https://www.instagram.com/${env.IG_USERNAME}/` : "https://www.instagram.com/";
}

function demoFeed(env, lang = "ja") {
  const captions = lang === "en" ? [
    "First visit? How to book, how long it takes, dress code and dietary requests.",
    "Courses & prices — lunch and dinner, tax and service explained.",
    "At the counter, the chef finishes Manyo beef right in front of you.",
    "Roast Manyo beef. Resting the meat is part of the recipe.",
    "A starter of seasonal vegetables from Kyoto growers.",
    "Burgundy and Champagne, chosen by our sommelier and chef to suit Manyo beef.",
    "Lunch only: the wagyu hamburg course.",
    "Celebrating? Ask us for a message plate.",
    "Shinmachi-dori, 5 minutes from Marutamachi Station.",
  ] : [
    "初めての方へ｜ご予約からお帰りまで。所要時間・服装・お子様のご利用について。",
    "コースと料金｜ランチ・ディナーそれぞれの内容と税・サービス料のご案内。",
    "店内とお過ごし方｜カウンターでは目の前で万葉牛を仕上げます。",
    "万葉牛のロースト。焼き上がりを休ませる時間も、料理の一部です。",
    "季節の野菜の前菜。京都の生産者から届いたものを中心に。",
    "ソムリエとシェフが選ぶ、万葉牛に寄り添うワイン。",
    "ランチ限定、和牛ハンバーグのコース。",
    "記念日のディナーに。メッセージプレートも承ります。",
    "新町通竹屋町。地下鉄丸太町駅から徒歩約5分。",
  ];
  const now = Date.now();
  return {
    demo: true,
    username: env.IG_USERNAME || "",
    profileUrl: profileUrl(env),
    updatedAt: new Date().toISOString(),
    posts: captions.map((caption, i) => ({
      id: `demo-${i}`,
      type: "IMAGE",
      image: null,
      caption,
      permalink: profileUrl(env),
      timestamp: new Date(now - i * 3.5 * 86400000).toISOString(),
    })),
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
