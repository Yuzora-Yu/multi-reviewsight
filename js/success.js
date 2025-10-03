document.addEventListener('DOMContentLoaded', async () => {
  const { supabase } = window;
  const p = new URLSearchParams(location.search);
  const id = p.get('id');
  const sid = p.get('sid'); // 短縮ID（8桁）

  if (!id) { document.body.innerHTML = '<p>idがありません</p>'; return; }
  const { data: r, error } = await supabase.from('reviews').select('*').eq('id', id).single();
  if (error || !r) { document.getElementById('card').textContent = '取得エラー'; return; }

  const img = r.product_image_url || 'https://placehold.co/128x128?text=No+Image';
  document.getElementById('card').innerHTML = `
    <div id="previewCard" class="border rounded p-4 flex gap-4">
      <img class="w-24 h-24 object-cover rounded bg-gray-100" src="${img}" />
      <div class="flex-1">
        <div class="text-sm text-gray-500">${r.genre} | ${new Date(r.created_at).toLocaleDateString()}</div>
        <h3 class="text-lg font-bold">${r.title}</h3>
        <div class="text-sm text-gray-600">${r.product_name} ${r.product_author ? '/ '+r.product_author : ''} ${r.price_text ? '/ '+r.price_text : ''}</div>
        <p class="mt-2 text-sm whitespace-pre-wrap">${r.body}</p>
      </div>
      <div class="text-2xl font-bold">${r.score}</div>
    </div>
  `;

  const reviewUrl = window.appUrl(`review.html?id=${id}`);
  const shortUrl = window.appUrl(`s/${sid || r.short_id}`); // 短縮URL（後述の s/ リダイレクトで実現）

  // ボタン
  document.getElementById('openReview').href = reviewUrl;

  document.getElementById('saveImage').addEventListener('click', async () => {
    const node = document.getElementById('previewCard');
    const canvas = await html2canvas(node, { useCORS: true, scale: 2 });
    const link = document.createElement('a');
    link.download = 'review.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  document.getElementById('shareX').addEventListener('click', async () => {
    const text = `だれでもレビューで「${r.title}」を投稿したよ！
${r.product_name}／${r.score}
#だれでもレビュー
${shortUrl}`;
    window.openTweetIntent(shortUrl, text, []);
  });
});
