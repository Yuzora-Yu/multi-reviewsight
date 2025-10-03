// js/top.js（ランキングを2段クエリに修正）
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

  // ---------- ランキング（ビュー→レビュー本体の2段） ----------
  const viewOf = (period) => ({
    all: 'v_review_stats_all',
    month: 'v_review_stats_month',
    week: 'v_review_stats_week',
    day: 'v_review_stats_day',
  }[period] || 'v_review_stats_all');

  async function refreshRanking() {
    const period  = document.getElementById('rankPeriod').value;
    const genre   = document.getElementById('rankGenre').value;
    const orderBy = document.getElementById('rankOrder').value; // 'views'|'likes'|'comments'
    const list = document.getElementById('rankList');

    // 1) ジャンルが指定されていれば、該当レビューIDを先に取得
    let idFilter = null;
    if (genre) {
      const { data: idsData, error: ge } = await supabase
        .from('reviews')
        .select('id').eq('genre', genre).limit(2000);
      if (ge) {
        list.innerHTML = `<li class="meta">ランキング取得エラー: ${ge.message}</li>`;
        return;
      }
      idFilter = (idsData || []).map(x => x.id);
      if (idFilter.length === 0) {
        list.innerHTML = '<li class="meta">該当なし</li>';
        return;
      }
    }

    // 2) 統計ビューから上位IDを取得
    const statsTable = viewOf(period);
    let statsQuery = supabase.from(statsTable).select('review_id, views, likes, comments');
    if (idFilter) statsQuery = statsQuery.in('review_id', idFilter);

    const { data: stats, error: se } = await statsQuery
      .order(orderBy, { ascending: false })
      .limit(50);

    if (se) {
      list.innerHTML = `<li class="meta">ランキング取得エラー: ${se.message}</li>`;
      return;
    }
    if (!stats || stats.length === 0) {
      list.innerHTML = '<li class="meta">データがありません</li>';
      return;
    }

    // 3) レビュー本体をまとめて取得 → マージして表示
    const ids = stats.map(s => s.review_id);
    const { data: reviews, error: re } = await supabase
      .from('reviews')
      .select('id, title, score, author_name, genre, product_name, product_image_url, created_at')
      .in('id', ids);
    if (re) {
      list.innerHTML = `<li class="meta">ランキング取得エラー: ${re.message}</li>`;
      return;
    }
    const map = new Map(reviews.map(r => [r.id, r]));
    list.innerHTML = stats.map((s, i) => {
      const r = map.get(s.review_id);
      if (!r) return '';
      return `<li><div class="flex items-center gap-3">
        <div class="text-2xl w-8 text-right">${i+1}</div>
        <div class="flex-1">${window.reviewCard(r)}</div>
        <div class="w-44 text-sm text-right">
          <div>表示数: ${s.views || 0}</div>
          <div>いいね: ${s.likes || 0}</div>
          <div>コメント: ${s.comments || 0}</div>
        </div>
      </div></li>`;
    }).join('');
  }

  ['rankPeriod','rankGenre','rankOrder'].forEach(id => {
    document.getElementById(id).addEventListener('change', refreshRanking);
  });
  refreshRanking();
});
