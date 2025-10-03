document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('postForm');
  const confirmSection = document.getElementById('confirmSection');
  const preview = {
    img: document.getElementById('previewImg'),
    genre: document.getElementById('previewGenre'),
    title: document.getElementById('previewTitle'),
    meta: document.getElementById('previewMeta'),
    body: document.getElementById('previewBody'),
    score: document.getElementById('previewScore'),
  };
  let formValues = null;

  // ---- 商品選択モーダル（既に導入済み想定） ----
  const picker = document.getElementById('productPicker');
  if (picker) {
    const toFlex = () => { picker.classList.remove('hidden'); picker.classList.add('flex'); };
    const toHide = () => { picker.classList.add('hidden'); picker.classList.remove('flex'); };
    document.getElementById('openProductPicker')?.addEventListener('click', toFlex);
    document.getElementById('closePicker')?.addEventListener('click', toHide);
    document.getElementById('openAmazon')?.addEventListener('click', () => {
      const q = encodeURIComponent(document.getElementById('amazonQuery').value.trim() || '');
      window.open(`https://www.amazon.co.jp/s?k=${q}`, '_blank');
    });
    document.getElementById('autoFetch')?.addEventListener('click', async () => {
      const url = document.getElementById('amazonUrl').value.trim();
      if (!url) return alert('URLを入力してください');
      try {
        const resp = await fetch('https://ovkumzhdxjljukfqchvu.supabase.co/functions/v1/meta-from-url', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
        });
        const meta = await resp.json();
        if (!resp.ok || !meta.ok) throw new Error(meta.error || 'fetch failed');
        // === フォームへ反映（空は保持） ===
        if (meta.name)  document.getElementById('product_name').value = meta.name;
        if (meta.brand) document.getElementById('product_author').value = meta.brand;
        if (meta.image) document.getElementById('product_image_url').value = meta.image;
        if (meta.price_text) document.getElementById('price_text').value = meta.price_text;
        if (meta.product_url) {
          const el = document.getElementById('product_link_url');
          el.value = meta.product_url;
        }
        // 自動でプレビュー更新
        buildPreviewFromForm();
        alert('商品情報を反映しました');
        toHide();
      } catch (e) {
        console.warn('meta-from-url error:', e);
        alert('自動取得に失敗しました。手入力でお願いします。');
      }
    });
  }

  // ---- プレビュー生成を関数化（反映漏れ防止） ----
  function buildPreviewFromForm() {
    const v = {
      product_name: document.getElementById('product_name').value.trim(),
      product_author: document.getElementById('product_author').value.trim(),
      product_link_url: document.getElementById('product_link_url').value.trim(),
      product_image_url: document.getElementById('product_image_url').value.trim(),
      price_text: document.getElementById('price_text').value.trim(),
      score: parseInt(document.getElementById('score').value,10),
      genre: document.getElementById('genre').value,
      author_name: document.getElementById('author_name').value.trim(),
      title: document.getElementById('title').value.trim(),
      body: document.getElementById('body').value,
      edit_password: document.getElementById('edit_password').value,
    };
    // プレビュー描画
    preview.img.src = v.product_image_url || 'https://placehold.co/128x128?text=No+Image';
    preview.genre.textContent = v.genre;
    preview.title.textContent = v.title || '(無題)';
    preview.meta.textContent = `${v.product_name}${v.product_author ? ' / ' + v.product_author : ''}${v.price_text ? ' / ' + v.price_text : ''}`;
    preview.body.textContent = v.body;
    preview.score.textContent = isFinite(v.score) ? v.score : '';
    return v;
  }

  // 入力のたびにプレビュー（任意）
  ['product_name','product_author','product_link_url','product_image_url','price_text','score','genre','author_name','title','body']
    .forEach(id => document.getElementById(id)?.addEventListener('input', buildPreviewFromForm));

  // 「投稿へ進む」→プレビュー表示
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    formValues = buildPreviewFromForm();
    confirmSection.classList.remove('hidden');
    confirmSection.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('backEdit').addEventListener('click', () => {
    confirmSection.classList.add('hidden');
  });

  // 投稿（完了ページへ遷移）
  document.getElementById('confirmPost').addEventListener('click', async () => {
    formValues = buildPreviewFromForm();
    const { supabase } = window;
    const user = (await supabase.auth.getUser()).data.user;
    const bodySan = DOMPurify.sanitize(formValues.body);
    const passHash = formValues.edit_password ? await window.sha256hex(formValues.edit_password) : null;

    const { data, error } = await supabase.from('reviews').insert({
      product_name: formValues.product_name,
      product_author: formValues.product_author || null,
      product_link_url: formValues.product_link_url || null, // disabledでもJSから拾うのでOK
      product_image_url: formValues.product_image_url || null,
      price_text: formValues.price_text || null,
      score: formValues.score,
      genre: formValues.genre,
      author_name: formValues.author_name || (user ? user.email?.split('@')[0] : '匿名'),
      author_user_id: user?.id || null,
      title: formValues.title,
      body: bodySan,
      edit_password_hash: passHash,
    }).select('id, short_id').single();

    if (error) { alert('投稿エラー: ' + error.message); return; }
    // 成功したら 完了ページへ（短縮URL用に short_id も付与）
    location.href = window.appUrl(`success.html?id=${data.id}&sid=${data.short_id}`);
  });
});
