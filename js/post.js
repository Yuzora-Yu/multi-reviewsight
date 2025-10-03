// js/post.js — GENRES自動注入 / レビュアーネーム自動入力 / 入力→確認→投稿 の本流

document.addEventListener('DOMContentLoaded', () => {
  main().catch(console.error);
});

async function main() {
  const sb = window.sb;

  // 1) GENRES を #genre に注入（common.js の populateGenreSelects でも可）
  try {
    const sel = document.getElementById('genre');
    if (sel && window.GENRES) {
      const keep = sel.querySelector('option[value=""]');
      sel.innerHTML = '';
      if (keep) sel.appendChild(keep);
      window.GENRES.forEach(g => {
        const o = document.createElement('option');
        o.value = g; o.textContent = g;
        sel.appendChild(o);
      });
    }
  } catch (e) { console.warn('genre populate failed', e); }

  // 2) レビュアーネームをページ表示直後に自動入力
  await presetAuthorName(sb);

  // 3) 商品選択モーダル（最小実装）
  setupProductPicker();

  // 4) 入力→確認
  document.getElementById('postForm').addEventListener('submit', (e) => {
    e.preventDefault();
    showConfirm();
  });

  document.getElementById('backEdit').addEventListener('click', () => {
    document.getElementById('confirmSection').classList.add('hidden');
    document.getElementById('postForm').classList.remove('hidden');
  });

  // 5) 投稿する（実POST）
  document.getElementById('confirmPost').addEventListener('click', async () => {
    const btn = document.getElementById('confirmPost');
    toggleBtn(btn, true, '投稿中…');
    try {
      const payload = collectPayload();
      // 文字列サニタイズ（本文）
      payload.body = DOMPurify.sanitize(payload.body);

      const { data, error } = await sb.from('reviews').insert(payload).select('id').single();
      if (error) throw error;

      toast('投稿しました');
      setTimeout(() => { location.href = `review.html?id=${data.id}`; }, 800);
    } catch (err) {
      alert('投稿に失敗しました: ' + (err?.message || err));
    } finally {
      toggleBtn(btn, false);
    }
  });
}

/* ===== helpers ===== */

async function presetAuthorName(sb) {
  const input = document.getElementById('author_name');
  if (!input) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) { input.placeholder = 'ログインすると自動入力されます'; return; }

  let name = (user.email || '').split('@')[0];
  try {
    const { data: prof } = await sb
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle();
    if (prof?.display_name) name = prof.display_name;
  } catch {}

  input.value = name;
}

function setupProductPicker() {
  const picker = document.getElementById('productPicker');
  const openBtn = document.getElementById('openProductPicker');
  const closeBtn = document.getElementById('closePicker');
  const openAmazon = document.getElementById('openAmazon');
  const autoFetch = document.getElementById('autoFetch');

  openBtn.addEventListener('click', () => picker.classList.remove('hidden'));
  closeBtn.addEventListener('click', () => picker.classList.add('hidden'));
  openAmazon.addEventListener('click', () => {
    const q = encodeURIComponent(document.getElementById('amazonQuery').value || '');
    window.open(`https://www.amazon.co.jp/s?k=${q}`, '_blank');
  });
  autoFetch.addEventListener('click', () => {
    const url = document.getElementById('amazonUrl').value.trim();
    if (url) {
      document.getElementById('product_link_url').value = url;
      picker.classList.add('hidden');
    }
  });
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

  document.getElementById('postForm').classList.add('hidden');
  document.getElementById('confirmSection').classList.remove('hidden');
}

function collectPayload() {
  const payload = {
    product_name: v('product_name'),
    product_author: v('product_author'),
    product_link_url: v('product_link_url'),
    product_image_url: v('product_image_url'),
    price_text: v('price_text'),
    score: Number(v('score') || 0),
    genre: v('genre'),
    author_name: v('author_name').trim() || '匿名',
    title: v('title'),
    body: v('body'),
    edit_password: v('edit_password') || null
  };
  return payload;

  function v(id) { return (document.getElementById(id)?.value ?? '').trim(); }
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
