// js/my.js —— フル置換
// マイページ：アカウント情報 / 自分のレビュー / いいね / コメントしたレビュー

document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.sb;

  // ログイン必須
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    alert('マイページはログインが必要です');
    location.href = 'auth.html';
    return;
  }

  // ====== 1) アカウント情報（display_name, email, joined） ======
  try {
    const email = user.email || '—';
    const joined = new Date(user.created_at).toLocaleDateString();

    // profiles から display_name を取得（なければメールIDを既定表示）
    const { data: prof } = await sb
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const displayName =
      prof?.display_name ||
      (email.includes('@') ? email.split('@')[0] : 'ユーザー');

    document.getElementById('accName').textContent = displayName;
    document.getElementById('accEmail').textContent = email;
    document.getElementById('accJoined').textContent = joined;
  } catch (e) {
    console.error(e);
  }

  // 共通：カード描画のヘルパ（common.js の reviewCard を利用）
  const renderCards = (wrapId, rows) => {
    const wrap = document.getElementById(wrapId);
    if (!rows || rows.length === 0) {
      wrap.innerHTML = '<div class="meta">まだありません</div>';
      return;
    }
    wrap.innerHTML = rows.map(r => window.reviewCard(r)).join('');
  };

  // ====== 2) 自分のレビュー ======
  try {
    const { data } = await sb.from('reviews')
      .select('id, title, score, author_name, genre, product_name, product_image_url, created_at')
      .eq('author_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    renderCards('myReviews', data || []);
  } catch (e) {
    console.error(e);
    document.getElementById('myReviews').innerHTML = '<div class="meta">取得エラー</div>';
  }

  // ====== 3) いいねしたレビュー ======
  try {
    const { data } = await sb.from('review_likes')
      .select('reviews(id, title, score, author_name, genre, product_name, product_image_url, created_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    const rows = (data || []).map(x => x.reviews).filter(Boolean);
    renderCards('myLikes', rows);
  } catch (e) {
    console.error(e);
    document.getElementById('myLikes').innerHTML = '<div class="meta">取得エラー</div>';
  }

  // ====== 4) コメントしたレビュー ======
  // review_comments から自分のコメントを拾い、レビューにJOIN。
  // 同一レビューへ複数コメントしていても1件に集約し、最新コメント日時で並べる。
  try {
    const { data: comments } = await sb.from('review_comments')
      .select('review_id, created_at, reviews(id, title, score, author_name, genre, product_name, product_image_url, created_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500);

    // 集約（review_id ごとに最新コメントのものだけ残す）
    const map = new Map();
    (comments || []).forEach(c => {
      if (!c?.reviews) return;
      const exist = map.get(c.review_id);
      if (!exist || new Date(c.created_at) > new Date(exist._last)) {
        map.set(c.review_id, { ...c.reviews, _last: c.created_at });
      }
    });
    const rows = Array.from(map.values()).sort((a, b) => new Date(b._last) - new Date(a._last));
    renderCards('myCommented', rows);
  } catch (e) {
    console.error(e);
    document.getElementById('myCommented').innerHTML = '<div class="meta">取得エラー</div>';
  }
});
