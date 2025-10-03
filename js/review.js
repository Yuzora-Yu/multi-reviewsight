// js/review.js — 詳細：本文/画像、コメント投稿/履歴（review_comments テーブル対応）

document.addEventListener('DOMContentLoaded', () => {
  init().catch(e => {
    console.error(e);
    document.getElementById('detailBody').textContent = '読み込みに失敗しました';
  });
});

async function init() {
  const sb = window.sb;
  const id = new URLSearchParams(location.search).get('id');

  // ===== レビュー本体 =====
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

  // ===== コメント履歴 =====
  await refreshComments(sb, id);

  // ===== コメント投稿 =====
  document.getElementById('commentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = document.getElementById('commentBody').value.trim();
    if (!body) return;

    const { data: { user } = { user: null } } = await sb.auth.getUser();
    if (!user) { window.openModal('#modalAuth'); return; }

    let author_name = (user.email || '').split('@')[0];
    try {
      const { data: prof } = await sb.from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (prof?.display_name) author_name = prof.display_name;
    } catch {}

    const { error: insErr } = await sb.from('review_comments').insert({
      review_id: id, body, user_id: user.id, author_name
    });
    if (insErr) { alert('コメント投稿に失敗しました'); return; }

    document.getElementById('commentBody').value = '';
    await refreshComments(sb, id);
  });

  // ===== モーダル内：ログイン/登録（UI反応あり） =====
  function bindAuthButton(btnId, mode) {
    const btn = document.getElementById(btnId);
    btn?.addEventListener('click', async () => {
      const email = document.getElementById('authEmail').value.trim();
      if (!email) return alert('メールアドレスを入力してください');

      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = '送信中...';

      try {
        const redirectTo = location.href;
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo, data: { locale: 'ja' } }
        });
        if (error) throw error;
        alert('メールを送信しました。受信トレイをご確認ください。');
        window.closeModal('#modalAuth');
      } catch (e) {
        alert((mode === 'register' ? '登録' : 'ログイン') + 'エラー: ' + (e?.message || e));
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }
  bindAuthButton('btnLogin', 'login');
  bindAuthButton('btnRegister', 'register');
}

async function refreshComments(sb, reviewId) {
  const list = document.getElementById('commentList');
  try {
    const { data, error } = await sb
      .from('review_comments')
      .select('id, body, author_name, created_at')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    list.innerHTML = (data || []).map(c => `
      <li class="review-box">
        <div class="meta">${escapeHtml(c.author_name || '匿名')} ｜ ${new Date(c.created_at).toLocaleString()}</div>
        <div class="mt-1">${escapeHtml(c.body || '')}</div>
      </li>
    `).join('') || `<li class="meta">まだコメントはありません</li>`;
  } catch (e) {
    console.error('review_comments fetch failed', e);
    list.innerHTML = `<li class="meta">コメントの取得に失敗しました</li>`;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
