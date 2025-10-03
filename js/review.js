// js/review.js — 詳細ページ：本文/画像/いいね、コメント投稿と履歴

document.addEventListener('DOMContentLoaded', () => {
  init().catch(e => {
    console.error(e);
    document.getElementById('detailBody').textContent = '読み込みに失敗しました';
  });
});

async function init() {
  const sb = window.sb;
  const id = new URLSearchParams(location.search).get('id');

  // レビュー本体
  const { data: r, error } = await sb
    .from('reviews')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !r) throw error || new Error('not found');

  // 反映
  document.getElementById('detailTitle').textContent = r.title;
  document.getElementById('detailMeta').textContent =
    `${r.genre} / ${r.author_name || '匿名'} / ${new Date(r.created_at).toLocaleDateString()}`;
  document.getElementById('detailScore').textContent = `スコア: ${r.score}`;
  document.getElementById('detailThumb').src =
    r.product_image_url || 'https://placehold.co/256x256?text=No+Image';
  document.getElementById('detailBody').textContent = r.body || '';

  // いいね（簡易）
  document.getElementById('likeBtn').addEventListener('click', async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return window.openModal('#modalAuth');

    // likes カラムがあるなら +1 する簡易例（実スキーマに合わせて変更）
    const { data, error } = await sb.rpc?.('increment_like', { rid: r.id }) || {};
    if (error) console.warn('like error:', error);
    else window.alert('いいねしました');
  });

  // コメント表示
  await refreshComments(sb, id);

  // コメント投稿
  document.getElementById('commentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = document.getElementById('commentBody').value.trim();
    if (!body) return;

    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.openModal('#modalAuth'); return; }

    // display_name を profiles から引く（無ければメール名）
    let author_name = (user.email || '').split('@')[0];
    try {
      const { data: prof } = await sb.from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (prof?.display_name) author_name = prof.display_name;
    } catch {}

    const { error } = await sb.from('comments').insert({
      review_id: id,
      body,
      user_id: user.id,
      author_name
    });
    if (error) {
      console.error(error);
      return window.alert('コメント投稿に失敗しました');
    }

    document.getElementById('commentBody').value = '';
    await refreshComments(sb, id);
  });

  // モーダル内 ログイン/登録
  document.getElementById('btnLogin').addEventListener('click', () => sendMagicLink(sb, 'login'));
  document.getElementById('btnRegister').addEventListener('click', () => sendMagicLink(sb, 'register'));
}

async function refreshComments(sb, reviewId) {
  const list = document.getElementById('commentList');
  const { data, error } = await sb
    .from('comments')
    .select('*')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error(error);
    list.innerHTML = `<li class="meta">コメントの取得に失敗しました</li>`;
    return;
  }

  list.innerHTML = data.map(c => `
    <li class="review-box">
      <div class="meta">${c.author_name || '匿名'} ｜ ${new Date(c.created_at).toLocaleString()}</div>
      <div class="mt-1">${escapeHtml(c.body || '')}</div>
    </li>
  `).join('') || `<li class="meta">まだコメントはありません</li>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[s]));
}

async function sendMagicLink(sb, mode) {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) return alert('メールアドレスを入力してください');

  // 戻りURL（現在のページ）
  const redirectTo = location.href;

  const fn = sb.auth.signInWithOtp;
  const { error } = await fn({
    email,
    options: { emailRedirectTo: redirectTo, data: { locale: 'ja' } }
  });
  if (error) return alert((mode === 'register' ? '登録' : 'ログイン') + 'リンク送信に失敗: ' + error.message);

  alert('メールを送信しました。受信トレイをご確認ください。');
  window.closeModal('#modalAuth');
}
