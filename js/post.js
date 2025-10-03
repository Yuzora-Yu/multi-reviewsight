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
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
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
    // プレビュー
    preview.img.src = v.product_image_url || 'https://placehold.co/128x128?text=No+Image';
    preview.genre.textContent = v.genre;
    preview.title.textContent = v.title;
    preview.meta.textContent = `${v.product_name} / ${v.product_author || ''} / ${v.price_text || ''}`;
    preview.body.textContent = v.body;
    preview.score.textContent = v.score;
    formValues = v;
    confirmSection.classList.remove('hidden');
    confirmSection.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('backEdit').addEventListener('click', () => {
    confirmSection.classList.add('hidden');
  });

  // 画像保存（ローカルDL）
  document.getElementById('saveImage').addEventListener('click', async () => {
    const node = document.getElementById('previewCard');
    const canvas = await html2canvas(node, { useCORS: true, scale: 2 });
    const link = document.createElement('a');
    link.download = 'review.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // 投稿
  document.getElementById('confirmPost').addEventListener('click', async () => {
    if (!formValues) return;
    const { supabase } = window;
    const user = (await supabase.auth.getUser()).data.user;
    const bodySan = DOMPurify.sanitize(formValues.body);
    const passHash = formValues.edit_password ? await window.sha256hex(formValues.edit_password) : null;

    const { data, error } = await supabase.from('reviews').insert({
      product_name: formValues.product_name,
      product_author: formValues.product_author || null,
      product_link_url: formValues.product_link_url || null,
      product_image_url: formValues.product_image_url || null,
      price_text: formValues.price_text || null,
      score: formValues.score,
      genre: formValues.genre,
      author_name: formValues.author_name || (user ? user.email?.split('@')[0] : '匿名'),
      author_user_id: user?.id || null,
      title: formValues.title,
      body: bodySan,
      edit_password_hash: passHash,
    }).select().single();

    if (error) { alert('投稿エラー: ' + error.message); return; }
    const reviewUrl = window.appUrl('review.html?id=' + data.id);
    alert('投稿しました！ページへ移動します。');
    location.href = reviewUrl;
  });

  // X共有
  document.getElementById('shareX').addEventListener('click', () => {
    if (!formValues) return;
    const shareUrl = window.APP_BASE_ABS; // トップを共有
    window.openTweetIntent(shareUrl, `「${formValues.title}」を投稿しました`, ['レビュー']);
  });
});
