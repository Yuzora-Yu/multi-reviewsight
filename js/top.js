// js/top.js — トップ：新着 / 検索 / ランキング（JOINを使わない実装）
document.addEventListener('DOMContentLoaded', () => {
  // top-level await は使わない（古いブラウザで落ちるため）
  init().catch(err => {
    console.error(err);
    const r = document.getElementById('rankList');
    if (r) r.innerHTML = `<li class="meta">初期化エラー: ${String(err?.message || err)}</li>`;
  });
});

async function init() {
  const sb = window.sb;

  // ===== 新着4件 =====
  {
    const { data, error } = await sb
      .from('reviews')
      .select('id, title, score, author_name, genre, product_name, product_image_url, created_at')
      .order('created_at', { ascending:false })
      .limit(4);

    const wrap = document.getElementById('latestList');
    if (!wrap) return;
    wrap.innerHTML = error
      ? `<div class="meta">新着取得エラー: ${error.message}</div>`
      : (data && data.length
          ? data.map(r => window.reviewCard(r)).join('')
          : '<div class="meta">まだありません</div>');
  }

  // ===== 検索 =====
  document.getElementById('searchForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const qProduct  = document.getElementById('qProduct').value.trim();
    const qAuthor   = document.getElementById('qAuthor').value.trim();
    const qGenre    = document.getElementById('qGenre').value;
    const qMinScore = parseInt(document.getElementById('qMinScore').value || '0', 10);

    let q = sb.from('reviews')
      .select('id, title, score, author_name, genre, product_name, product_image_url, created_at')
      .gte('score', qMinScore)
      .order('created_at', { ascending:false });

    if (qProduct) q = q.ilike('product_name', `%${qProduct}%`);
    if (qAuthor)  q = q.ilike('author_name', `%${qAuthor}%`);
    if (qGenre)   q = q.eq('genre', qGenre);

    const { data, error } = await q.limit(50);
    const target = document.getElementById('searchResults');
    target.innerHTML = error
      ? `<div class="meta">検索エラー: ${error.message}</div>`
      : (data && data.length
          ? data.map(r => window.reviewCard(r)).join('')
          : '<div class="meta">該当なし</div>');
  });

  // ===== ランキング =====
  const rankPeriod = document.getElementById('rankPeriod');
  const rankGenre  = document.getElementById('rankGenre');
  const rankOrder  = document.getElementById('rankOrder');
  const rankList   = document.getElementById('rankList');

  const viewMap = {
    all:  'v_review_stats_all',
    month:'v_review_stats_month',
    week: 'v_review_stats_week',
    day:  'v_review_stats_day',
  };

  async function refreshRanking() {
    const period  = rankPeriod.value;            // all | month | week | day
    const genre   = rankGenre.value;             // '' or ジャンル
    const orderBy = rankOrder.value || 'views';  // views | likes | comments

    const view = viewMap[period] || viewMap.all;

    // 1) ビューからランキング（IDと数値だけ）
    const { data: stats, error: e1 } = await sb
      .from(view)
      .select('review_id, views, likes, comments')
      .order(orderBy, { ascending:false })
      .limit(200); // 多めに取っておく（後でジャンルで絞る）

    if (e1) {
      rankList.innerHTML = `<li class="meta">ランキング取得エラー: ${e1.message}</li>`;
      return;
    }
    if (!stats || !stats.length) {
      rankList.innerHTML = '<li class="meta">データがありません</li>';
      return;
    }

    // 2) ランキング上位の review 詳細をまとめて取得
    const ids = stats.map(s => s.review_id);
    const { data: reviews, error: e2 } = await sb
      .from('reviews')
      .select('id, title, score, author_name, genre, product_name, product_image_url, created_at')
      .in('id', ids);

    if (e2) {
      rankList.innerHTML = `<li class="meta">レビュー取得エラー: ${e2.message}</li>`;
      return;
    }

    // 3) id -> review の辞書化
    const dict = new Map(reviews.map(r => [r.id, r]));

    // 4) 元の順位を維持しつつマージ、ジャンルで絞る
    const rows = [];
    for (const s of stats) {
      const r = dict.get(s.review_id);
      if (!r) continue;
      if (genre && r.genre !== genre) continue; // ジャンル絞り
      rows.push({ ...r, _stats: s });
      if (rows.length >= 50) break;
    }

    // 5) 描画
    rankList.innerHTML = rows.map((r, i) => {
      const views = r._stats?.views ?? 0;
      const likes = r._stats?.likes ?? 0;
      const comments = r._stats?.comments ?? 0;
      return `
      <li>
        <div class="flex items-center gap-3">
          <div class="rank-num">${i+1}</div>
          <div class="flex-1">
            ${window.reviewCardWithStats(r, { views, likes, comments })}
          </div>
        </div>
      </li>
      `;
    }).join('');
  }

  rankPeriod?.addEventListener('change', refreshRanking);
  rankGenre ?.addEventListener('change', refreshRanking);
  rankOrder ?.addEventListener('change', refreshRanking);
  await refreshRanking();
}
