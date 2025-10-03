// js/top.js — 新着4件 / 検索は既存維持 / ランキングはクライアント集計で堅牢化

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error(err);
    const r = document.getElementById('rankList');
    if (r) r.innerHTML = `<li class="meta">初期化エラー: ${String(err?.message || err)}</li>`;
  });
});

async function init() {
  const sb = window.sb;

  /* ===== 新着4件（元の仕様のまま） ===== */
  await renderLatest4(sb);

  /* ===== ランキング ===== */
  const rankList  = document.getElementById('rankList');
  const rankGenre = document.getElementById('rankGenre');
  const rankOrder = document.getElementById('rankOrder');
  const rankPeriod= document.getElementById('rankPeriod');

  async function refreshRanking() {
    rankList.innerHTML = `<li class="meta">更新中...</li>`;

    // フィルタ
    const period = (rankPeriod?.value || '').trim(); // '', '7d', '30d', '365d'
    const genre  = (rankGenre?.value || '').trim();
    const order  = (rankOrder?.value || 'views').trim(); // 'views' | 'likes' | 'comments'

    // 期間の fromISO
    let fromISO = null;
    if (period) {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 365;
      fromISO = new Date(Date.now() - days*24*60*60*1000).toISOString();
    }

    // 1) reviews から候補（最大100）
    let q = sb.from('reviews').select('*');
    if (fromISO) q = q.gte('created_at', fromISO);
    if (genre)   q = q.eq('genre', genre);

    let rows = [];
    try {
      const { data, error } = await q.order('created_at', { ascending:false }).limit(100);
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      console.error('reviews fetch failed', e);
      rankList.innerHTML = `<li class="meta">レビュー取得に失敗しました</li>`;
      return;
    }
    if (!rows.length) {
      rankList.innerHTML = `<li class="meta">条件に一致するレビューがありません</li>`;
      return;
    }

    // 2) コメント・いいね・閲覧数を IN で集計してマージ
    const ids = rows.map(r => r.id);

    // 2-1) comments: {review_id, count}
    const commentsMap = await safeCountBy(sb, 'comments', 'review_id', ids);

    // 2-2) likes: {review_id, count}
    const likesMap = await safeCountBy(sb, 'likes', 'review_id', ids);

    // 2-3) views: まず review_views があれば count(*), 無ければ reviews.views、どちらも無ければ 0
    let viewsMap = {};
    try {
      viewsMap = await safeCountBy(sb, 'review_views', 'review_id', ids);
    } catch { viewsMap = {}; }

    // マージ
    const enriched = rows.map(r => ({
      ...r,
      _comments: commentsMap[r.id] ?? (r.comments ?? 0),
      _likes:    likesMap[r.id]    ?? (r.likes ?? 0),
      _views:    viewsMap[r.id]    ?? (r.views ?? 0),
    }));

    // 並べ替え
    const sortKey = order === 'likes' ? '_likes' : order === 'comments' ? '_comments' : '_views';
    enriched.sort((a,b) => (b[sortKey] - a[sortKey]));

    // 3) 描画（20件まで）
    rankList.innerHTML = enriched.slice(0,20).map((r,i) => {
      const views = r._views, likes = r._likes, comments = r._comments;
      return `
        <li>
          <div class="flex items-center gap-3">
            <div class="rank-num">${i + 1}</div>
            <div class="flex-1">
              ${window.reviewCardWithStats
                ? window.reviewCardWithStats(r, { views, likes, comments })
                : fallbackCard(r, { views, likes, comments })
              }
            </div>
          </div>
        </li>`;
    }).join('');
  }

  // IN で { key -> count } を作る汎用関数（列名やテーブルが無ければ 0 扱い）
  async function safeCountBy(sb, table, key, ids) {
    try {
      // PostgREST: group by は RPC が安全だが、ここではテーブルが小規模想定で全件 in 取得→JS集計
      const { data, error } = await sb.from(table).select(key).in(key, ids).limit(10000);
      if (error) throw error;
      const map = {};
      for (const row of (data || [])) {
        const k = row[key];
        map[k] = (map[k] || 0) + 1;
      }
      return map;
    } catch (e) {
      // テーブルが無い or RLS で弾かれても 0 扱いにする
      console.warn(`countBy ${table} failed`, e?.message || e);
      return {};
    }
  }

  function fallbackCard(r, { views, likes, comments }) {
    const img = r.product_image_url || 'https://placehold.co/128x128?text=No+Image';
    const url = `review.html?id=${r.id}`;
    return `
      <a class="card" href="${url}">
        <div class="mediaBox"><img src="${img}" alt=""></div>
        <div class="flex-1">
          <div class="meta">${r.genre}｜${new Date(r.created_at).toLocaleDateString()}</div>
          <div class="title u-break">${r.title}</div>
          <div class="meta u-break">${r.product_name} / ${r.author_name || '匿名'}</div>
          <div class="card-stats">
            <span>表示数: ${views}</span>
            <span>いいね: ${likes}</span>
            <span>コメント: ${comments}</span>
          </div>
        </div>
        <div class="text-2xl font-bold">${r.score}</div>
      </a>`;
  }

  rankPeriod?.addEventListener('change', refreshRanking);
  rankGenre ?.addEventListener('change', refreshRanking);
  rankOrder ?.addEventListener('change', refreshRanking);

  await refreshRanking();
}

async function renderLatest4(sb) {
  const latestEl = document.getElementById('latestList');
  try {
    const { data, error } = await sb
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(4);
    if (error) throw error;
    latestEl.innerHTML = data.map(r => window.reviewCard(r)).join('');
  } catch (e) {
    console.error(e);
    latestEl.innerHTML = `<div class="meta">新着の読み込みに失敗しました</div>`;
  }
}
