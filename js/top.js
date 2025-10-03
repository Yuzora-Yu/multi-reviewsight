// js/top.js — 新着4件 / ランキングを v_review_stats_* で集計（reviews とマージ）

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error(err);
    const r = document.getElementById('rankList');
    if (r) r.innerHTML = `<li class="meta">初期化エラー: ${String(err?.message || err)}</li>`;
  });
});

async function init() {
  const sb = window.sb;

  await renderLatest4(sb);

  const rankList  = document.getElementById('rankList');
  const rankGenre = document.getElementById('rankGenre');
  const rankOrder = document.getElementById('rankOrder');
  const rankPeriod= document.getElementById('rankPeriod');

  async function refreshRanking() {
    rankList.innerHTML = `<li class="meta">更新中...</li>`;

    const period = (rankPeriod?.value || '').trim();   // '', '7d', '30d', '365d'
    const genre  = (rankGenre?.value || '').trim();
    const order  = (rankOrder?.value || 'views').trim(); // 'views'|'likes'|'comments'

    const viewName = period === '7d' ? 'v_review_stats_week'
                    : period === '30d' ? 'v_review_stats_month'
                    : /* '365d' or '' */ 'v_review_stats_all';

    // 1) ビューから統計を取得（ジャンルで reviews 経由フィルタするので、まず全体を取る）
    let stats = [];
    try {
      const { data, error } = await sb
        .from(viewName)
        .select('*')
        .limit(500); // 十分な上限
      if (error) throw error;
      stats = data || [];
    } catch (e) {
      console.warn('stats view fetch failed, fallback to client aggregation', e);
      // フォールバック：前回のクライアント集計に切替（必要なら要請してね）
      return await refreshRankingFallbackClient();
    }

    // 2) reviews をIDで引いて詳細＆ジャンルを得る
    const idList = stats.map(s => s.review_id).filter(Boolean);
    if (!idList.length) {
      rankList.innerHTML = `<li class="meta">データがありません</li>`;
      return;
    }
    const { data: reviews, error: err2 } = await sb
      .from('reviews')
      .select('*')
      .in('id', idList);
    if (err2) {
      console.error(err2);
      rankList.innerHTML = `<li class="meta">レビュー情報の取得に失敗しました</li>`;
      return;
    }

    // 3) マージ（列名のゆらぎを吸収）
    const byId = Object.fromEntries(reviews.map(r => [r.id, r]));
    const merged = stats.map(s => {
      const r = byId[s.review_id];
      if (!r) return null;

      const views    = s.views ?? s.view_count ?? s.views_count ?? 0;
      const likes    = s.likes ?? s.like_count ?? s.likes_count ?? 0;
      const comments = s.comments ?? s.comment_count ?? s.comments_count ?? 0;

      return { ...r, _views: views, _likes: likes, _comments: comments };
    }).filter(Boolean);

    // 4) ジャンルフィルタ（ビューにジャンルが無いので reviews 側で）
    const filtered = genre ? merged.filter(m => m.genre === genre) : merged;

    // 5) 並び替え
    const key = order === 'likes' ? '_likes' : order === 'comments' ? '_comments' : '_views';
    filtered.sort((a,b) => (b[key] - a[key]));

    // 6) 描画
    rankList.innerHTML = filtered.slice(0, 20).map((r, i) => {
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

  // フォールバック（ビューが使えない場合）：必要なら使ってください
  async function refreshRankingFallbackClient() {
    const period = (rankPeriod?.value || '').trim();
    const genre  = (rankGenre?.value || '').trim();
    const order  = (rankOrder?.value || 'views').trim();

    // 期間 fromISO（週/月/年の代替）
    let fromISO = null;
    if (period) {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 365;
      fromISO = new Date(Date.now() - days*24*60*60*1000).toISOString();
    }

    // reviews
    let q = sb.from('reviews').select('*');
    if (fromISO) q = q.gte('created_at', fromISO);
    if (genre)   q = q.eq('genre', genre);
    const { data: rows, error } = await q.order('created_at', { ascending:false }).limit(100);
    if (error || !rows?.length) {
      rankList.innerHTML = `<li class="meta">ランキング取得に失敗しました</li>`;
      return;
    }

    // クライアント集計（likes/comments/review_views をINで）
    const ids = rows.map(r => r.id);
    const commentsMap = await safeCountBy(sb, 'review_comments', 'review_id', ids);
    const likesMap    = await safeCountBy(sb, 'review_likes', 'review_id', ids);
    const viewsMap    = await safeCountBy(sb, 'review_views', 'review_id', ids);

    const enriched = rows.map(r => ({
      ...r,
      _comments: commentsMap[r.id] ?? (r.comments ?? 0),
      _likes:    likesMap[r.id]    ?? (r.likes ?? 0),
      _views:    viewsMap[r.id]    ?? (r.views ?? 0),
    }));
    const key = order === 'likes' ? '_likes' : order === 'comments' ? '_comments' : '_views';
    enriched.sort((a,b) => (b[key] - a[key]));

    rankList.innerHTML = enriched.slice(0, 20).map((r,i) => {
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

  async function safeCountBy(sb, table, key, ids) {
    try {
      const { data, error } = await sb.from(table).select(key).in(key, ids).limit(10000);
      if (error) throw error;
      const map = {};
      for (const row of (data || [])) {
        const k = row[key];
        map[k] = (map[k] || 0) + 1;
      }
      return map;
    } catch (e) {
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
