// js/post.js — GENRES自動注入 / レビュアーネーム自動入力
//               Amazon自動転記（Edge Function + timeout & retry）
//               ★投稿は「ログイン済みユーザーのみ」許可

document.addEventListener('DOMContentLoaded', () => {
  main().catch(e => {
    console.error(e);
    alert('初期化に失敗しました。コンソールを確認してください。');
  });
});

async function main() {
  if (!window.sb) {
    console.error('[post] Supabase client (window.sb) が未初期化です。common.js と鍵設定を確認してください。');
    throw new Error('Supabase 未初期化');
  }
  const sb = window.sb;

  // 1) GENRES を <select data-genres> に反映
  try { window.populateGenreSelects?.(); } catch {}

  // 2) レビュアーネームをページ表示直後に自動入力（ログイン時）
  await presetAuthorName(sb);

  // 3) 投稿はログイン必須：未ログインならモーダルを促す
  gatePostingByLogin(sb);

  // 4) 商品選択モーダル（Amazon転記つき）
  setupProductPicker(sb);

  // 5) 入力 → 確認
  document.getElementById('postForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    // ログイン必須チェック（未ログインならモーダルを出してreturn）
    const user = await requireLoginOrPrompt(sb, 'レビュー投稿にはログインが必要です。');
    if (!user) return;

    const err = validateInputs();
    if (err) { alert(err); return; }
    showConfirm();
  });

  // 6) 確認 → 編集に戻る
  document.getElementById('backEdit').addEventListener('click', () => {
    document.getElementById('confirmSection').classList.add('hidden');
    document.getElementById('postForm').classList.remove('hidden');
  });

  // 7) 投稿実行（ログイン必須）
  document.getElementById('confirmPost').addEventListener('click', async () => {
    const btn = document.getElementById('confirmPost');

    // ログイン必須チェック
    const user = await requireLoginOrPrompt(sb, 'レビュー投稿にはログインが必要です。');
    if (!user) return;

    toggleBtn(btn, true, '投稿中…');
    try {
      const payload = collectPayload();

      // サニタイズ（本文）
      if (window.DOMPurify) payload.body = DOMPurify.sanitize(payload.body);

      // 空の編集パスワードは送らない
      if (!payload.edit_password) delete payload.edit_password;

      const { data, error } = await sb.from('reviews').insert(payload).select('id').single();
      if (error) throw error;

      window.toast?.('投稿しました');
      setTimeout(() => { location.href = `review.html?id=${data.id}`; }, 700);
    } catch (err) {
      console.error('[post] insert error:', err);
      alert('投稿に失敗しました: ' + (err?.message || err));
    } finally {
      toggleBtn(btn, false);
    }
  });

  // 8) auth 状態の変化でゲート表示を更新（ログイン完了 → ゲートを消す）
  sb.auth.onAuthStateChange((_event, session) => {
    const isLoggedIn = !!session?.user;
    setGateVisibility(isLoggedIn);
    if (isLoggedIn) presetAuthorName(sb).catch(()=>{});
  });
}

/* ====== ログイン・ゲート関連 ====== */

// 未ログインなら注意枠を出して投稿をブロック
function gatePostingByLogin(sb) {
  sb.auth.getUser().then(({ data: { user } }) => {
    setGateVisibility(!!user);
  }).catch(()=>{});
}

function setGateVisibility(isLoggedIn){
  let gate = document.getElementById('postGate');
  if (!gate) {
    gate = document.createElement('div');
    gate.id = 'postGate';
    gate.className = 'review-box';
    gate.style.marginBottom = '12px';
    const sec = document.querySelector('main .sec')?.parentElement || document.querySelector('main');
    sec?.insertBefore(gate, sec.firstChild);
  }
  gate.textContent = isLoggedIn
    ? 'ログイン済み：このまま投稿できます。'
    : 'レビュー投稿を行うにはログインが必要です。右上の「ログイン / 登録」からログインしてください。';
  gate.style.display = 'block';
}

async function requireLoginOrPrompt(sb, msg){
  const { data: { user } } = await sb.auth.getUser();
  if (user) return user;
  // 画面に注意出し＆モーダルを開く（auth.html と共通）
  try { window.toast?.(msg); } catch {}
  try { window.openModal?.('#modalLogin'); } catch {}
  return null;
}

/* ====== Amazon 取得モーダル ====== */

function setupProductPicker(sb) {
  const picker = document.getElementById('productPicker');
  const openBtn = document.getElementById('openProductPicker');
  const closeBtn = document.getElementById('closePicker');
  const openAmazon = document.getElementById('openAmazon');
  const autoFetch = document.getElementById('autoFetch');

  openBtn.addEventListener('click', () => picker.classList.remove('hidden'));
  closeBtn.addEventListener('click', () => picker.classList.add('hidden'));

  // Amazon 検索（別タブ）
  openAmazon.addEventListener('click', () => {
    const q = encodeURIComponent(document.getElementById('amazonQuery').value || '');
    window.open(`https://www.amazon.co.jp/s?k=${q}`, '_blank', 'noopener');
  });

  // URL からの自動取得（Edge Function 経由 / timeout & 1回リトライ）
  autoFetch.addEventListener('click', async () => {
    const raw = document.getElementById('amazonUrl').value.trim();
    if (!raw) return alert('Amazonの商品URLを貼り付けてください');

    const url = normalizeAmazonUrl(raw);
    const btn = autoFetch;
    toggleBtn(btn, true, '取得中…');

    try {
      const { data, error } = await invokeWithTimeoutAndRetry('meta-from-url', { url }, { timeoutMs: 12000, retries: 1 });
      if (error) {
        alert(`関数呼び出しに失敗しました: ${error.message || JSON.stringify(error)}`);
        return;
      }
      if (!data?.ok) {
        alert(`取得に失敗しました: ${data?.error || 'unknown error'}`);
        return;
      }

      // 反映（互換キーも許容）
      if (data.product_name || data.name) {
        document.getElementById('product_name').value = data.product_name || data.name;
      }
      if (data.author_or_maker || data.brand) {
        document.getElementById('product_author').value = data.author_or_maker || data.brand;
      }
      if (data.price_text) {
        document.getElementById('price_text').value = data.price_text;
      }
      if (data.product_image_url || data.image) {
        document.getElementById('product_image_url').value = data.product_image_url || data.image;
      }

      document.getElementById('product_link_url').value = data.product_url || url;
      window.toast?.('Amazonから転記しました');
      picker.classList.add('hidden');
    } catch (e) {
      console.error('[meta] error', e);
      alert(e?.message === 'timeout'
        ? 'サーバーが混雑しています。もう一度お試しください。'
        : '取得時にエラーが発生しました');
    } finally {
      toggleBtn(btn, false);
    }
  });
}

// /dp/ASIN 形式に補正して軽量・安定化
function normalizeAmazonUrl(u){
  try{
    const url = new URL(u);
    const m = url.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
    if (m) return `https://www.${url.hostname}/dp/${m[1]}`;
    return u;
  }catch{ return u; }
}

// invoke にタイムアウト＋1回リトライを付与
async function invokeWithTimeoutAndRetry(fnName, body, {timeoutMs=12000, retries=1} = {}) {
  const attempt = async () => {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs));
    const call = window.sb.functions.invoke(fnName, { body });
    return Promise.race([call, timeout]);
  };
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await attempt(); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 600)); }
  }
  throw lastErr;
}

/* ====== 入力・確認・投稿 ====== */

async function presetAuthorName(sb) {
  const input = document.getElementById('author_name');
  if (!input) return;

  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { input.placeholder = 'ログインすると自動入力されます'; return; }

    let name = (user.email || '').split('@')[0];
    const { data: prof } = await sb
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle();
    if (prof?.display_name) name = prof.display_name;

    input.value = name;
  } catch (e) {
    console.warn('presetAuthorName failed:', e);
  }
}

function validateInputs() {
  const score = Number((document.getElementById('score').value || '').trim());
  if (!(score >= 0 && score <= 100)) return '得点は 0〜100 の範囲で入力してください。';
  if (!document.getElementById('product_name').value.trim()) return '商品名は必須です。';
  if (!document.getElementById('genre').value.trim()) return 'ジャンルを選択してください。';
  if (!document.getElementById('title').value.trim()) return 'レビュータイトルを入力してください。';
  if (!document.getElementById('body').value.trim()) return 'レビュー内容を入力してください。';
  return null;
}

function showConfirm() {
  const data = collectPayload();

  // プレビュー反映
  document.getElementById('previewImg').src = data.product_image_url || 'https://placehold.co/128x128?text=No+Image';
  document.getElementById('previewGenre').textContent = data.genre || '';
  document.getElementById('previewTitle').textContent = data.title || '';
  document.getElementById('previewMeta').textContent =
    `${data.product_name || ''} / ${data.author_name || '匿名'}`;
  document.getElementById('previewBody').textContent = data.body || '';
  document.getElementById('previewScore').textContent = String(data.score ?? '-');

  // 画面切替
  document.getElementById('postForm').classList.add('hidden');
  document.getElementById('confirmSection').classList.remove('hidden');
}

function collectPayload() {
  const v = (id) => (document.getElementById(id)?.value ?? '').trim();
  return {
    product_name: v('product_name'),
    product_author: v('product_author'),
    product_link_url: v('product_link_url') || null,
    product_image_url: v('product_image_url') || null,
    price_text: v('price_text') || null,
    score: Number(v('score') || 0),
    genre: v('genre'),
    author_name: v('author_name').trim() || '匿名',
    title: v('title'),
    body: v('body'),
    edit_password: v('edit_password') || null
  };
}

/* ====== 汎用 ====== */

function toggleBtn(btn, busy, altText){
  if (!btn) return;
  if (busy){ btn.dataset._t = btn.textContent; btn.disabled = true; if(altText) btn.textContent = altText; }
  else { btn.disabled = false; btn.textContent = btn.dataset._t || btn.textContent; }
}
