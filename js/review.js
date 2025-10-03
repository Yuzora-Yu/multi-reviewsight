// js/review.js — 画像中央・表示回数記録・コメント20件ページング・未ログイン時はモーダル誘導・いいね反応

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
  const { data: r, error } = await sb.from('reviews').select('*').eq('id', reviewId).maybeSingle();
  if (error || !r) throw error || new Error('not found');

  // 反映
  document.getElementById('detailTitle').textContent = r.title;
  document.getElementById('detailMeta').textContent = `${r.genre} / ${r.author_name || '匿名'} / ${new Date(r.created_at).toLocaleDateString()}`;
  document.getElementById('detailScore').textContent = `スコア: ${r.score}`;
  document.getElementById('detailThumb').src = r.product_image_url || 'https://placehold.co/256x256?text=No+Image';
  document.getElementById('detailBody').textContent = r.body || '';

  // ===== 表示回数カウント =====
  recordView(sb, reviewId).catch(console.warn);

  // ===== コメント（20件ずつ・昇順番号） =====
  const cm = setupComments(sb, reviewId);

  // ===== いいね =====
  const likeBtn = document.getElementById('likeBtn');
  likeBtn?.addEventListener('click', async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      showInlineNotice('ログインが必要です。ログインすると「いいね」やコメント投稿ができます。');
      openAuthModal(); // ログインモーダル
      return;
    }
    try {
      await sb.from('review_likes').insert({ review_id: reviewId, user_id: user.id });
      toast('いいねしました');
      // 見た目の反応
      likeBtn.disabled = true;
      likeBtn.textContent = 'いいね済み';
      // コメント欄の番号は変わらないが、必要ならランキング更新等に使う
    } catch (e) {
      // ユニーク制約で既に押しているなど
      toast('すでに「いいね」済みの可能性があります');
    }
  });

  // ===== コメント投稿 =====
  document.getElementById('commentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = document.getElementById('commentBody').value.trim();
    if (!body) return;

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      showInlineNotice('ログインが必要です。ログインするとコメントを投稿できます。');
      openAuthModal();
      return;
    }

    // 表示名
    let commenter_name = (user.email || '').split('@')[0];
    try {
      const { data: prof } = await sb.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle();
      if (prof?.display_name) commenter_name = prof.display_name;
    } catch {}

    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    toggleBtn(btn, true, '投稿中…');
    try {
      const { error: insErr } = await sb.from('review_comments').insert({
        review_id: reviewId, user_id: user.id, commenter_name, body
      });
      if (insErr) throw insErr;
      document.getElementById('commentBody').value = '';
      toast('コメントを投稿しました');
      await cm.reloadFromTop(); // 先頭から読み直し＆番号振り直し
    } catch (err) {
      alert('コメント投稿に失敗しました: ' + (err?.message || err));
    } finally {
      toggleBtn(btn, false);
    }
  });

  // ===== review ページの画像センター（保険） =====
  document.body.setAttribute('data-page', 'review');

  // ===== モーダル：ログイン⇔新規登録の遷移ボタン（レビュー用モーダルの場合） =====
  document.getElementById('btnGoRegister')?.addEventListener('click', () => {
    window.closeModal('#modalAuth');
    window.openModal('#modalRegister');
  });
}

function setupComments(sb, reviewId) {
  const PAGE = 20;
  let page = 0; // 0-based
  const listEl = document.getElementById('commentList');
  const moreBtn = document.getElementById('commentMore') || createMoreButton();

  moreBtn.addEventListener('click', async () => {
    page++;
    await fetchAndRenderPage(page, false);
  });

  // 初回：ページ0を描画（昇順＝古い→新しい、掲示板のように1,2,3…）
  reloadFromTop();

  async function reloadFromTop() {
    page = 0;
    listEl.innerHTML = '';
    moreBtn.classList.add('hidden');
    await fetchAndRenderPage(0, true);
  }

  async function fetchAndRenderPage(p, renumber) {
    const from = p * PAGE;
    const to   = from + PAGE - 1;

    const { data, error } = await sb
      .from('review_comments')
      .select('id, body, commenter_name, created_at')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: true }) // ← 昇順
      .range(from, to);

    if (error) {
      console.error('review_comments fetch failed', error);
      if (!listEl.innerHTML) listEl.innerHTML = `<li class="meta">コメントの取得に失敗しました</li>`;
      moreBtn.classList.add('hidden');
      return;
    }

    const startIndex = from + 1; // 表示番号の起点
    const items = (data || []).map((c, i) => commentItem(startIndex + i, c)).join('');
    listEl.insertAdjacentHTML('beforeend', items);

    if ((data || []).length === PAGE) moreBtn.classList.remove('hidden');
    else moreBtn.classList.add('hidden');

    if (renumber) { /* 今回は startIndex で連番になっているので追加処理不要 */ }
  }

  function commentItem(n, c) {
    const name = escapeHtml(c.commenter_name || '匿名');
    const when = new Date(c.created_at).toLocaleString();
    const body = escapeHtml(c.body || '');
    return `
      <li class="review-box">
        <div class="meta">#${n} ｜ ${when} ｜ ${name}</div>
        <div class="mt-1">${body}</div>
      </li>`;
  }

  function createMoreButton() {
    const wrap = document.createElement('div');
    wrap.className = 'text-center mt-3';
    const btn = document.createElement('button');
    btn.id = 'commentMore';
    btn.className = 'btn-outline hidden';
    btn.textContent = 'もっと見る';
    wrap.appendChild(btn);
    listEl.parentElement.appendChild(wrap);
    return btn;
  }

  return { reloadFromTop };
}

async function recordView(sb, reviewId) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    await sb.from('review_views').insert({
      review_id: reviewId,
      user_id: user?.id ?? null
    });
  } catch (e) {
    console.warn('recordView failed', e?.message || e);
  }
}

// ===== 共通 helpers =====
function openAuthModal(){ 
  // レビュー画面用の簡易モーダル（ログイン/新規登録の2ボタンを併設している想定）
  const modal = document.querySelector('#modalAuth') || document.querySelector('#modalLogin') || document.querySelector('#modalRegister');
  if (modal?.id === 'modalRegister') window.openModal('#modalRegister');
  else window.openModal('#modalAuth'); // まずは auth を開く。無ければ login/register にフォールバック
}
function showInlineNotice(msg){
  let el = document.getElementById('authNotice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'authNotice';
    el.className = 'review-box';
    const host = document.querySelector('main .block'); // 1つ目のブロック下に
    host?.parentNode?.insertBefore(el, host.nextSibling);
  }
  el.textContent = msg;
}
function toast(msg) {
  const wrap = document.getElementById('toastWrap') || (() => {
    const w = document.createElement('div'); w.id='toastWrap'; w.className='toast-wrap'; document.body.appendChild(w); return w;
  })();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2000);
}
function toggleBtn(btn, busy, altText){
  if (!btn) return;
  if (busy){ btn.dataset._t = btn.textContent; btn.disabled = true; if(altText) btn.textContent = altText; }
  else { btn.disabled = false; btn.textContent = btn.dataset._t || btn.textContent; }
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
