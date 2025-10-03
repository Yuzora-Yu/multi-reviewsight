// js/review.js — 画像中央強制 / 閲覧数記録 / コメント20件昇順＋番号 / 未ログイン時はモーダル誘導
//                ログイン・新規登録は auth.html と同じ実装（メール＋パスワード）

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

  // ページ識別（画像センタリングの強制用）
  document.body.setAttribute('data-page', 'review');

  // ===== レビュー本体 =====
  const { data: r, error } = await sb.from('reviews').select('*').eq('id', reviewId).maybeSingle();
  if (error || !r) throw error || new Error('not found');

  // 反映
  byId('detailTitle').textContent = r.title;
  byId('detailMeta').textContent =
    `${r.genre} / ${r.author_name || '匿名'} / ${new Date(r.created_at).toLocaleDateString()}`;
  byId('detailScore').textContent = String(r.score ?? '-');
  byId('detailThumb').src = r.product_image_url || 'https://placehold.co/256x256?text=No+Image';
  byId('detailBody').textContent = r.body || '';

  // ===== 表示回数（失敗しても落ちない） =====
  recordView(sb, reviewId);

  // ===== コメント（20件ずつ・昇順番号） =====
  const cm = setupComments(sb, reviewId);

  // ===== いいね =====
  const likeBtn = byId('likeBtn');
  likeBtn?.addEventListener('click', async () => {
    const user = await getUser(sb);
    if (!user) return needLogin('「いいね」するにはログインが必要です。');

    try {
      await sb.from('review_likes').insert({ review_id: reviewId, user_id: user.id });
      toast('いいねしました');
      likeBtn.disabled = true;
      likeBtn.textContent = 'いいね済み';
    } catch (e) {
      toast('すでに「いいね」済みの可能性があります');
      console.warn(e?.message || e);
    }
  });

  // ===== コメント投稿 =====
  byId('commentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = byId('commentBody').value.trim();
    if (!text) return;

    const user = await getUser(sb);
    if (!user) return needLogin('コメントを投稿するにはログインが必要です。');

    let commenter_name = (user.email || '').split('@')[0];
    try {
      const { data: prof } = await sb.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle();
      if (prof?.display_name) commenter_name = prof.display_name;
    } catch {}

    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    toggleBtn(btn, true, '投稿中…');
    try {
      const { error: insErr } = await sb.from('review_comments').insert({
        review_id: reviewId, user_id: user.id, commenter_name, body: text
      });
      if (insErr) throw insErr;
      byId('commentBody').value = '';
      toast('コメントを投稿しました');
      await cm.reloadFromTop();
    } catch (err) {
      alert('コメント投稿に失敗しました: ' + (err?.message || err));
    } finally {
      toggleBtn(btn, false);
    }
  });

  // ===== ログインモーダル：auth.html と同じ動作 =====
  byId('loginFormReview')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = byId('loginEmailReview').value.trim();
    const pass  = byId('loginPassReview').value;
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    toggleBtn(btn, true, '処理中…');
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      if (!data?.session || !data?.user) throw new Error('セッション確立に失敗');
      window.closeModal('#modalLogin');
      toast('ログインしました');
    } catch (err) {
      alert('ログインに失敗しました: ' + (err?.message || err));
    } finally {
      toggleBtn(btn, false);
    }
  });

  // ログイン→新規登録へ
  byId('goRegisterFromLogin')?.addEventListener('click', () => {
    window.closeModal('#modalLogin');
    window.openModal('#modalRegister');
  });

  // 新規登録（仮登録）
  byId('registerFormReview')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = byId('regEmailReview').value.trim();
    const p1 = byId('regPassReview').value;
    const p2 = byId('regPass2Review').value;
    if (p1 !== p2) return alert('パスワードが一致しません');

    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    toggleBtn(btn, true, '送信中…');
    try {
      const { error } = await sb.auth.signUp({ email, password: p1, options: { emailRedirectTo: location.href } });
      if (error) throw error;
      window.closeModal('#modalRegister');
      toast('確認メールを送信しました');
    } catch (err) {
      alert('登録に失敗しました: ' + (err?.message || err));
    } finally {
      toggleBtn(btn, false);
    }
  });
}

/* ===== コメント（20件ずつ・昇順番号） ===== */
function setupComments(sb, reviewId) {
  const PAGE = 20;
  let page = 0; // 0-based
  const listEl = byId('commentList');
  const moreBtn = byId('commentMore') || createMoreButton();

  moreBtn.addEventListener('click', async () => {
    page++;
    await fetchAndRenderPage(page);
  });

  reloadFromTop();

  async function reloadFromTop() {
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
        .order('created_at', { ascending: true }) // 昇順（掲示板スタイル）
        .range(from, to);
      if (error) throw error;

      const startIndex = from + 1;
      const items = (data || []).map((c, i) => commentItem(startIndex + i, c)).join('');
      listEl.insertAdjacentHTML('beforeend', items);

      if ((data || []).length === PAGE) moreBtn.classList.remove('hidden');
      else moreBtn.classList.add('hidden');
    } catch (e) {
      console.error('review_comments fetch failed', e);
      if (!listEl.innerHTML) listEl.innerHTML = `<li class="meta">コメントの取得に失敗しました</li>`;
      moreBtn.classList.add('hidden');
    }
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

/* ===== 表示回数 ===== */
async function recordView(sb, reviewId) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    // 必須列が review_id と user_id のみ、created_at はデフォルトという前提
    await sb.from('review_views').insert({
      review_id: reviewId,
      user_id: user?.id ?? null
    });
  } catch (e) {
    // RLSやスキーマ差異で失敗してもアプリは落とさない
    console.warn('recordView failed:', e?.message || e);
  }
}

/* ===== 共通小物 ===== */
function byId(id){ return document.getElementById(id); }
async function getUser(sb){ const { data: { user } } = await sb.auth.getUser(); return user; }
function needLogin(msg){
  showInlineNotice(msg);
  window.openModal('#modalLogin');
}
function showInlineNotice(msg){
  let el = document.getElementById('authNotice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'authNotice';
    el.className = 'review-box';
    const host = document.querySelector('main .block');
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
