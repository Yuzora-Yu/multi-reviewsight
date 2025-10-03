document.addEventListener('DOMContentLoaded', async () => {
  const { supabase } = window;
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) {
    alert('マイページはログインが必要です'); location.href = 'auth.html'; return;
  }

  // 自分のレビュー
  const my = await supabase.from('reviews')
    .select('id, title, score, author_name, genre, product_name, product_image_url, created_at')
    .eq('author_user_id', user.id).order('created_at', { ascending: false });
  document.getElementById('myReviews').innerHTML =
    (my.data || []).map(r => window.reviewCard(r)).join('') || '<div class="meta">まだありません</div>';

  // いいねしたレビュー
  const liked = await supabase.from('review_likes')
    .select('reviews(id, title, score, author_name, genre, product_name, product_image_url, created_at)')
    .eq('user_id', user.id).order('created_at', { ascending: false });
  const arr = (liked.data || []).map(x => x.reviews).filter(Boolean);
  document.getElementById('myLikes').innerHTML =
    arr.map(r => window.reviewCard(r)).join('') || '<div class="meta">まだありません</div>';
});
