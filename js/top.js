// js/top.js — トップ：新着4件 / 検索 / ランキング（JOINなし）

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error(err);
    const r = document.getElementById('rankList');
    if (r) r.innerHTML = `<li class="meta">初期化エラー: ${String(err?.message || err)}</li>`;
  });
});

async function init() {
  const sb = window.sb;

  /* ===== 新着4件 ===== */
  {
    const latestEl = document.getElementById('latestList');
    try {
      const { data, error } = await sb
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(4);
      if (error) throw error;

      latestEl.innerHTML = data.map(r => window.reviewCard(r)).join('');
      // 画像比率クラスを付与
      window.fitThumbs(latestEl);
    } catch (e) {
      console.error(e);
      latestEl.innerHTML = `<div class="meta">新着の読み込みに失敗しました</div>`;
    }
  }

  /* ===== ランキング ===== */
  const rankList  = document.getElementById('rankList');
  const rankGenre = document.getElementById('rankGenre');
  const rankOrder = document.getElementById('rankOrder');
  const rankPeriod= document.getElementById('rankPeriod');

  async function refreshRanking() {
    rankList.innerHTML = `<li class="meta">更新中...</li>`;

    try {
      // ここはあなたの既存の取得ロジックに合わせてください
      // サンプル：views/likes/comments を集計済みテーブル or RPCで取得する想定
      const { data: rows, error } = await sb
        .from('review_stats_view') // 例: ビュー名の例。あなたの実装に合わせて変更
        .select('*')
        .order(rankOrder?.value || 'views', { ascending: false })
        .limit(20);
      if (error) throw error;

      const items = rows.map((r, i) => {
        const views = r.views ?? 0;
        const likes = r.likes ?? 0;
        const comments = r.comments ?? 0;

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

      rankList.innerHTML = items;
      // 画像比率クラスを付与
      window.fitThumbs(rankList);
    } catch (e) {
      console.error(e);
      rankList.innerHTML = `<li class="meta">ランキングの読み込みに失敗しました</li>`;
    }
  }

  // フォールバック：reviewCardWithStats 未定義でも動く簡易カード
  function fallbackCard(r, { views, likes, comments }) {
    const img = r.product_image_url || 'https://placehold.co/128x128?text=No+Image';
    const url = `review.html?id=${r.id}`;
    return `
      <a class="card" href="${url}">
        <div class="mediaBox">
          <img src="${img}" alt="" data-fit="auto">
        </div>
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
