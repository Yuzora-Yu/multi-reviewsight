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
  // Supabase 初期化チェック
  if (!window.sb) throw new Error('Supabase client が未初期化です（common.js と鍵設定を確認）');
  const sb = window.sb;

  const reviewId = new URLSearchParams(location.search).get('id');
  if (!reviewId) throw new Error('id が指定されていません');

  // ページ識別（画像センタリングの強制用）
  document.body.setAttribute('data-page', 'review');

  // ===== レビュー本体 =====
  const { data: r, error } = await sb.from('reviews').select('*').eq('id', reviewId).maybeSingle();
  if (error || !r) throw error || new Error('not found');

  // 反映
  byId('detailTitle').textContent = r.title || '';
  byId('detailMeta').textContent =
    `${r.genre || '-'} / ${r.author_name || '匿名'} / ${new Date(r.created_at).toLocaleDateString('ja-JP')}`;
  // “スコア”の文字は付けず、数字のみ
  byId('detailScore').textContent = String(r.score ?? '-');

  const img = byId('detailThumb');
  img.src = r.product_image_url || 'https://placehold.co/256x256?text=No+Image';
  img.alt = r.product_name || r.title || 'image';

  // 本文（プレーンテキストを安全に表示）
  byId('detailBody').textContent = r.body || '';

  // ===== 表示回数（失敗しても落ちない） =====
  recordView(sb, reviewId); // await しない：失敗してもUIは続行

  // ===== いいね（初期状態反映＋押下時処理） =====
  setupLike(sb, reviewId).catch(console.warn);

  // ===== コメント（20件ずつ・昇順番号） =====
  const cm = setupComments(sb, reviewId);

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
      // ログイン後に「いいね済み状態」を再判定
      setupLike(sb, reviewId).catch(console.warn);
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

/* ===== いいね：初期状態＋押下処理 ===== */
async function setupLike(sb, reviewId) {
  const likeBtn = byId('likeBtn');
  if (!likeBtn) return;

  likeBtn.disabled = false;
  likeBtn.textContent = 'いいね';

  const user = await getUser(sb);
  if (user) {
    // すでに「いいね」済みかを確認してボタン状態を反映
    try {
      const { data: liked } = await sb.from('review_likes')
        .select('id').eq('review_id', reviewId).eq('user_id', user.id).maybeSingle();
      if (liked) {
        likeBtn.disabled = true;
        likeBtn.textContent = 'いいね済み';
      }
    } catch {}
  }

  likeBtn.onclick = async () => {
    const u = await getUser(sb);
    if (!u) return needLogin('「いいね」するにはログインが必要です。');

    likeBtn.disabled = true;
    try {
      await sb.from('review_likes').insert({ review_id: reviewId, user_id: u.id });
      toast('いいねしました');
      likeBtn.textContent = 'いいね済み';
    } catch (e) {
      // 二重押しやUK違反など
      toast('すでに「いいね」済みの可能性があります');
      console.warn(e?.message || e);
      likeBtn.textContent = 'いいね済み';
    }
  };
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
    const when = new Date(c.created_at).toLocaleString('ja-JP');
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

/* ===== 表示回数（user_id 列が無くても動くフォールバック版） ===== */
async function recordView(sb, reviewId) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    const base = { review_id: reviewId };

    // 1回目: user_id を付けてみる
    let { error, status } = await sb.from('review_views').insert({ ...base, user_id: user?.id ?? null });
    if (!error) return;

    // user_id 列が無い／スキーマ未反映など → フォールバック
    const msg = (error && (error.message || JSON.stringify(error))) || '';
    const shouldRetryWithoutUser =
      String(status) === '400' || String(status) === '404' || /user_id/i.test(msg) || /schema/i.test(msg) || /PGRST204/.test(msg);

    if (shouldRetryWithoutUser) {
      const res2 = await sb.from('review_views').insert(base);
      if (res2.error) {
        console.warn('recordView retry failed:', res2.error);
      }
    } else {
      console.warn('recordView failed:', error);
    }
  } catch (e) {
    console.warn('recordView unexpected:', e);
  }
}


/* ===== 共通小物 ===== */
function byId(id){ return document.getElementById(id); }
async function getUser(sb){ const { data: { user } } = await sb.auth.getUser(); return user; }
function needLogin(msg){
  showInlineNotice(msg);
  window.openModal?.('#modalLogin');
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
