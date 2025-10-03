// ----- js/top.js（置き換え） -----
document.addEventListener('DOMContentLoaded', () => {
  const supabase = window.sb;

  // 新着5件
  (async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, title, score, author_name, genre, product_name, product_image_url, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    const latestList = document.getElementById('latestList');
    latestList.innerHTML = error
      ? `<div class="meta">エラー: ${error.message}</div>`
      : (data || []).map(r => window.reviewCard(r)).join('') || '<div class="meta">まだありません</div>';
  })();

  // 検索
  document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const qProduct = document.getElementById('qProduct').value.trim();
    const qAuthor = document.getElementById('qAuthor').value.trim();
    const qGenre = document.getElementById('qGenre').value;
    const qMinScore = parseInt(document.getElementById('qMinScore').value || '0', 10);

    let query = supabase
      .from('reviews')
      .select('id, title, score, author_name, genre, product_name, product_image_url, created_at')
      .gte('score', qMinScore)
      .order('created_at', { ascending: false });

    if (qProduct) query = query.ilike('product_name', `%${qProduct}%`);
    if (qAuthor)  query = query.ilike('author_name', `%${qAuthor}%`);
    if (qGenre)   query = query.eq('genre', qGenre);

    const { data, error } = await query.limit(50);
    const target = document.getElementById('searchResults');
    target.innerHTML = error
      ? `<div class="meta">検索エラー: ${error.message}</div>`
      : (data || []).map(r => window.reviewCard(r)).join('') || '<div class="meta">該当なし</div>';
  });

  // ランキング
  const refreshRanking = async () => {
    const period  = document.getElementById('rankPeriod').value;
    const genre   = document.getElementById('rankGenre').value;
    const orderBy = document.getElementById('rankOrder').value; // 'views'|'likes'|'comments'

    const viewName = {
      all: 'v_review_stats_all',
      month: 'v_review_stats_month',
      week: 'v_review_stats_week',
      day: 'v_review_stats_day',
    }[period];

    let q = supabase
      .from('reviews')
      .select(`
        id, title, score, author_name, genre, product_name, product_image_url, created_at,
        stats:${viewName}!inner(review_id, views, likes, comments)
      `);

    if (genre) q = q.eq('genre', genre);

    // ★ 外部テーブルの列でソートする時は foreignTable:'stats' を指定
    const { data, error } = await q
      .order(orderBy, { ascending: false, foreignTable: 'stats' })
      .limit(50);

    const list = document.getElementById('rankList');
    if (error) {
      list.innerHTML = `<li class="meta">ランキング取得エラー: ${error.message}</li>`;
      return;
    }
    list.innerHTML = (data || []).map((r, i) => {
      const views    = r.stats?.views ?? 0;
      const likes    = r.stats?.likes ?? 0;
      const comments = r.stats?.comments ?? 0;
      return `<li><div class="flex items-center gap-3">
        <div class="text-2xl w-8 text-right">${i+1}</div>
        <div class="flex-1">${window.reviewCard(r)}</div>
        <div class="w-44 text-sm text-right">
          <div>表示数: ${views}</div>
          <div>いいね: ${likes}</div>
          <div>コメント: ${comments}</div>
        </div>
      </div></li>`;
    }).join('');
  };

  ['rankPeriod','rankGenre','rankOrder'].forEach(id => {
    document.getElementById(id).addEventListener('change', refreshRanking);
  });
  refreshRanking();
});
