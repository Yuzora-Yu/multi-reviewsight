// js/review.js — 詳細：本文/画像、コメント（review_comments / commenter_name）＋ 20件ページング

document.addEventListener('DOMContentLoaded', () => {
  init().catch(e => {
    console.error(e);
    const bodyEl = document.getElementById('detailBody');
    if (bodyEl) bodyEl.textContent = '読み込みに失敗しました';
  });
});

async function init() {
  const sb = window.sb;
  const reviewId = new URLSearchParams(location.search).get('id');

  // ===== レビュー本体 =====
  const { data: r, error } = await sb
    .from('reviews')
    .select('*')
    .eq('id', reviewId)
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

  // ===== コメント履歴（20件ずつ） =====
  setupComments(sb, reviewId);

  // ===== コメント投稿 =====
  document.getElementById('commentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = document.getElementById('commentBody').value.trim();
    if (!body) return;

    const { data: { user } = { user: null } } = await sb.auth.getUser();
    if (!user) { window.openModal('#modalAuth'); return; }

    // 表示名：profiles.display_name があれば優先、無ければメールのローカル部
    let commenter_name = (user.email || '').split('@')[0];
    try {
      const { data: prof } = await sb.from('profiles')
        .select('display_name').eq('user_id', user.id).maybeSingle();
      if (prof?.display_name) commenter_name = prof.display_name;
    } catch {}

    const { error: insErr } = await sb.from('review_comments').insert({
      review_id: reviewId,
      user_id: user.id,
      commenter_name,
      body
    });
    if (insErr) { alert('コメント投稿に失敗しました'); return; }

    document.getElementById('commentBody').value = '';
    await reloadComments(); // 先頭ページに戻して再読込
  });

  // ===== モーダル（ログイン/登録のUI反応） =====
  bindAuthButton('btnLogin', 'login');
  bindAuthButton('btnRegister', 'register');

  function bindAuthButton(btnId, mode) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const email = document.getElementById('authEmail')?.value?.trim();
      if (!email) return alert('メールアドレスを入力してください');
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = '送信中...';
      try {
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: location.href, data: { locale: 'ja' } }
        });
        if (error) throw error;
        alert('メールを送信しました。受信トレイをご確認ください。');
        window.closeModal('#modalAuth');
      } catch (e) {
        alert((mode === 'register' ? '登録' : 'ログイン') + 'エラー: ' + (e?.message || e));
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    });
  }

  // ===== 内部：コメント一覧のページング実装 =====
  function setupComments(sb, reviewId) {
    const PAGE = 20;
    let page = 0;  // 0始まり

    const listEl = document.getElementById('commentList');
    const moreBtn = ensureMoreButton();

    moreBtn.addEventListener('click', async () => {
      page++;
      await fetchAndRenderPage(page);
    });

    // 初回読み込み（page=0を描画）
    reloadComments();

    async function reloadComments() {
      page = 0;
      listEl.innerHTML = '';
      moreBtn.classList.add('hidden');
      await fetchAndRenderPage(0);
    }

    async function fetchAndRenderPage(p) {
      const from = p * PAGE;
      const to   = from + PAGE - 1;

      try {
        const { data, error } = await sb
          .from('review_comments')
          .select('id, body, commenter_name, created_at')
          .eq('review_id', reviewId)
          .order('created_at', { ascending: false })
          .range(from, to);
        if (error) throw error;

        const items = (data || []).map(c => commentItem(c)).join('');
        listEl.insertAdjacentHTML('beforeend', items);

        // 次ページがあり得るときだけ「もっと見る」を出す（取得件数が満杯なら続きがある可能性）
        if ((data || []).length === PAGE) {
          moreBtn.classList.remove('hidden');
        } else {
          moreBtn.classList.add('hidden');
        }
      } catch (e) {
        console.error('review_comments fetch failed', e);
        if (!listEl.innerHTML) listEl.innerHTML = `<li class="meta">コメントの取得に失敗しました</li>`;
        moreBtn.classList.add('hidden');
      }
    }

    function commentItem(c) {
      const name = escapeHtml(c.commenter_name || '匿名');
      const when = new Date(c.created_at).toLocaleString();
      const body = escapeHtml(c.body || '');
      return `
        <li class="review-box">
          <div class="meta">${name} ｜ ${when}</div>
          <div class="mt-1">${body}</div>
        </li>`;
    }

    function ensureMoreButton() {
      // HTML側に <div class="text-center mt-3"><button id="commentMore" ...> が無い場合は作る
      let btn = document.getElementById('commentMore');
      if (!btn) {
        const wrap = document.createElement('div');
        wrap.className = 'text-center mt-3';
        btn = document.createElement('button');
        btn.id = 'commentMore';
        btn.className = 'btn-outline hidden';
        btn.textContent = 'もっと見る';
        wrap.appendChild(btn);
        const commentsSection = document.getElementById('commentList')?.parentElement;
        commentsSection?.appendChild(wrap);
      }
      return btn;
    }
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[s]));
}
