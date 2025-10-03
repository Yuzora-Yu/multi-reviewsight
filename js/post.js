// js/post.js  — レビュー投稿フロー（プレビュー → 最終確認 → 投稿）
// 依存：window.sb（Supabaseクライアント）, DOMPurify, html2canvas,
//       window.sha256hex, window.appUrl, window.openTweetIntent

document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.sb;

  // --- 要素参照 ---
  const form = document.getElementById('postForm');
  const confirmSection = document.getElementById('confirmSection');

  const els = {
    product_name:      document.getElementById('product_name'),
    product_author:    document.getElementById('product_author'),
    product_link_url:  document.getElementById('product_link_url'),
    product_image_url: document.getElementById('product_image_url'),
    price_text:        document.getElementById('price_text'),
    score:             document.getElementById('score'),
    genre:             document.getElementById('genre'),
    author_name:       document.getElementById('author_name'),
    title:             document.getElementById('title'),
    body:              document.getElementById('body'),
    edit_password:     document.getElementById('edit_password'),
  };

  // --- プレビュー領域 ---
  const pv = {
    img:   document.getElementById('previewImg'),
    genre: document.getElementById('previewGenre'),
    title: document.getElementById('previewTitle'),
    meta:  document.getElementById('previewMeta'),
    body:  document.getElementById('previewBody'),
    score: document.getElementById('previewScore'),
  };

  // --- ログインしていたらレビュアーネームを自動補完（profiles） ---
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      const { data: prof } = await sb.from('profiles')
        .select('reviewer_name').eq('user_id', user.id).maybeSingle();
      if (prof?.reviewer_name && !els.author_name.value) {
        els.author_name.value = prof.reviewer_name;
      }
    }
  } catch { /* noop */ }

  // --- 商品選択モーダル（Amazon） ---
  const picker = document.getElementById('productPicker');
  const openPickerBtn = document.getElementById('openProductPicker');
  const closePickerBtn = document.getElementById('closePicker');
  const openAmazonBtn  = document.getElementById('openAmazon');
  const autoFetchBtn   = document.getElementById('autoFetch');

  if (openPickerBtn && picker) {
    openPickerBtn.addEventListener('click', () => {
      picker.classList.remove('hidden'); picker.classList.add('flex');
    });
    closePickerBtn?.addEventListener('click', () => {
      picker.classList.add('hidden'); picker.classList.remove('flex');
    });
    openAmazonBtn?.addEventListener('click', () => {
      const q = encodeURIComponent(document.getElementById('amazonQuery').value.trim() || '');
      const url = `https://www.amazon.co.jp/s?k=${q}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
    autoFetchBtn?.addEventListener('click', async () => {
      const url = document.getElementById('amazonUrl').value.trim();
      if (!url) return alert('商品ページURLを入力してください');
      try {
        const resp = await fetch('https://ovkumzhdxjljukfqchvu.supabase.co/functions/v1/meta-from-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (!resp.ok) throw new Error('取得に失敗しました');
        const meta = await resp.json();

        if (meta.name)  els.product_name.value       = meta.name;
        if (meta.brand) els.product_author.value     = meta.brand;
        if (meta.image) els.product_image_url.value  = meta.image;
        if (meta.price_text) els.price_text.value    = meta.price_text;
        if (meta.product_url) els.product_link_url.value = meta.product_url;

        updatePreview();
        alert('商品情報を反映しました');
        picker.classList.add('hidden'); picker.classList.remove('flex');
      } catch (e) {
        alert('自動取得できませんでした。手入力でお願いします。');
      }
    });
  }

  // --- プレビュー更新 ---
  function updatePreview() {
    const img = els.product_image_url.value.trim();
    pv.img.src = img || 'https://placehold.co/256x256?text=No+Image';
    pv.genre.textContent = els.genre.value;
    pv.title.textContent = els.title.value.trim();
    pv.meta.textContent = [
      els.product_name.value.trim(),
      els.product_author.value.trim(),
      els.price_text.value.trim()
    ].filter(Boolean).join(' / ');
    pv.body.textContent = els.body.value;
    pv.score.textContent = String(els.score.value || '');
  }

  // 入力のたびにプレビューを更新（軽量）
  ['input','change'].forEach(ev => {
    form.addEventListener(ev, (e) => {
      const t = e.target;
      if (t && (t.id in els)) updatePreview();
    });
  });

  // --- 1. 入力→最終確認表示 ---
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    updatePreview();
    confirmSection.classList.remove('hidden');
    confirmSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // --- 2. 修正に戻る ---
  document.getElementById('backEdit').addEventListener('click', () => {
    confirmSection.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // --- 3. プレビューを画像保存（ローカルDL） ---
  document.getElementById('saveImage').addEventListener('click', async () => {
    const node = document.getElementById('previewCard');
    const canvas = await html2canvas(node, { useCORS: true, scale: 2 });
    const a = document.createElement('a');
    a.download = 'review.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  // --- 4. 投稿（DBへinsert） ---
  document.getElementById('confirmPost').addEventListener('click', async () => {
    // 必須軽いバリデーション
    if (!els.product_name.value.trim()) return alert('商品名を入力してください');
    if (!els.title.value.trim())        return alert('タイトルを入力してください');
    const s = Number(els.score.value);
    if (!Number.isFinite(s) || s < 0 || s > 100) return alert('得点は0〜100で入力してください');

    const { data: { user } } = await sb.auth.getUser();
    // 表示名の既定：入力 > profiles.reviewer_name > user.emailローカル部 > 匿名
    let fallbackName = '匿名';
    if (user?.email) fallbackName = user.email.split('@')[0];
    try {
      if (user) {
        const { data: prof } = await sb.from('profiles')
          .select('reviewer_name').eq('user_id', user.id).maybeSingle();
        if (prof?.reviewer_name) fallbackName = prof.reviewer_name;
      }
    } catch {}

    const authorName = (els.author_name.value || '').trim() || fallbackName;

    const payload = {
      product_name:      els.product_name.value.trim(),
      product_author:    els.product_author.value.trim() || null,
      product_link_url:  els.product_link_url.value.trim() || null,
      product_image_url: els.product_image_url.value.trim() || null,
      price_text:        els.price_text.value.trim() || null,
      score:             s,
      genre:             els.genre.value,
      author_name:       authorName,
      author_user_id:    user?.id || null,
      title:             els.title.value.trim(),
      body:              DOMPurify.sanitize(els.body.value),
      edit_password_hash: els.edit_password.value
        ? await window.sha256hex(els.edit_password.value) : null,
    };

    const { data, error } = await sb.from('reviews').insert(payload).select().single();
    if (error) {
      alert('投稿エラー：' + error.message);
      return;
    }
    alert('投稿しました！ページへ移動します。');
    location.href = window.appUrl('review.html?id=' + data.id);
  });

  // --- 5. Xへ投稿（下書き：リンクだけ） ---
  document.getElementById('shareX').addEventListener('click', () => {
    const text = `「${els.title.value.trim() || 'レビュー'}」を投稿準備中`;
    window.openTweetIntent(window.APP_BASE_ABS, text, ['レビュー']);
  });
});
