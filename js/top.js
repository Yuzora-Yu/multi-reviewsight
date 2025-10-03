  // ランキング：views / likes / comments
  const refreshRanking = async () => {
  const period = document.getElementById('rankPeriod').value;
  const genre  = document.getElementById('rankGenre').value;
  const orderBy= document.getElementById('rankOrder').value; // views|likes|comments
  const viewName = { all:'v_review_stats_all', month:'v_review_stats_month', week:'v_review_stats_week', day:'v_review_stats_day' }[period];

  let q = window.supabase.from('reviews').select(`
    id, title, score, author_name, genre, product_name, product_image_url, created_at,
    stats:${viewName}!inner(review_id, views, likes, comments)
  `);
  if (genre) q = q.eq('genre', genre);

  const { data, error } = await q.order(orderBy, { ascending:false, foreignTable:'stats' }).limit(50);
  const list = document.getElementById('rankList');
  if (error) { list.innerHTML = `<li class="meta">ランキング取得エラー: ${error.message}</li>`; return; }
  list.innerHTML = (data || []).map((r,i)=>`
    <li><div class="flex items-center gap-3">
      <div class="text-2xl w-8 text-right">${i+1}</div>
      <div class="flex-1">${window.reviewCard(r)}</div>
      <div class="w-44 text-sm text-right">
        <div>表示数: ${r.stats?.views ?? 0}</div>
        <div>いいね: ${r.stats?.likes ?? 0}</div>
        <div>コメント: ${r.stats?.comments ?? 0}</div>
      </div>
    </div></li>`).join('');
};
['rankPeriod','rankGenre','rankOrder'].forEach(id => document.getElementById(id).addEventListener('change', refreshRanking));
await refreshRanking();
