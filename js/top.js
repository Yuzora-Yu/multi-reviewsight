document.addEventListener('DOMContentLoaded', async () => {
  const { supabase } = window;

  // 新着5件
  const latest = await supabase.from('reviews')
    .select('id, title, score, author_name, genre, product_name, product_image_url, created_at')
    .order('created_at', { ascending: false }).limit(5);
  const latestList = document.getElementById('latestList');
  latestList.innerHTML = (latest.data || []).map(r => window.reviewCard(r)).join('') ||
    '<div class="meta">まだありません</div>';

  // 検索
  document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const qProduct = document.getElementById('qProduct').value.trim();
    const qAuthor = document.getElementById('qAuthor').value.trim();
    const qGenre = document.getElementById('qGenre').value;
    const qMinScore = parseInt(document.getElementById('qMinScore').value || '0', 10);

    let query = supabase.from('reviews')
      .select('id, title, score, author_name, genre, product_name, product_image_url, created_at')
      .gte('score', qMinScore)
      .order('created_at', { ascending: false });

    if (qProduct) query = query.ilike('product_name', `%${qProduct}%`);
    if (qAuthor) query = query.ilike('author_name', `%${qAuthor}%`);
    if (qGenre) query = query.eq('genre', qGenre);

    const { data, error } = await query.limit(50);
    const target = document.getElementById('searchResults');
    target.innerHTML = error ? `<div class="meta">検索エラー: ${error.message}</div>` :
      (data || []).map(r => window.reviewCard(r)).join('') || '<div class="meta">該当なし</div>';
  });

  // ランキング
  const refreshRanking = async () => {
    const period = document.getElementById('rankPeriod').value;
    const genre = document.getElementById('rankGenre').value;
    const orderBy = document.getElementById('rankOrder').value; // views / likes
    const viewName = {
      all: 'v_review_stats_all',
      month: 'v_review_stats_month',
      week: 'v_review_stats_week',
      day: 'v_review_stats_day',
    }[period];

    let q = supabase.from('reviews')
      .select(`id, title, score, author_name, genre, product_name, product_image_url, created_at,
               stats:${viewName}!inner(review_id, views, likes)`);

    if (genre) q = q.eq('genre', genre);

    const { data, error } = await q.order(`stats.${orderBy}`, { ascending: false }).limit(50);
    const list = document.getElementById('rankList');
    if (error) { list.innerHTML = `<li class="meta">ランキング取得エラー: ${error.message}</li>`; return; }
    list.innerHTML = (data || []).map((r, i) => {
      return `<li><div class="flex items-center gap-3">
        <div class="text-2xl w-8 text-right">${i+1}</div>
        <div class="flex-1">${window.reviewCard(r)}</div>
        <div class="w-36 text-sm text-right">
          <div>表示数: ${r.stats?.views || 0}</div>
          <div>いいね: ${r.stats?.likes || 0}</div>
        </div>
      </div></li>`;
    }).join('');
  };

  ['rankPeriod','rankGenre','rankOrder'].forEach(id => {
    document.getElementById(id).addEventListener('change', refreshRanking);
  });
  await refreshRanking();
});
