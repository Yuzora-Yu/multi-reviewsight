// js/admin.js
document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.sb;

  // 認証チェック
  const { data: { user } } = await sb.auth.getUser();
  const me = document.getElementById('me');
  if (!user) {
    me.textContent = '未ログインです。ログイン後に再度アクセスしてください。';
    return;
  }
  me.textContent = `ログイン中: ${user.email}`;

  // サーバー側で is_admin() を確認する方法（簡易）
  const { data: adminOk } = await sb.rpc('is_admin'); // ← SQL関数をそのまま呼べます
  if (!adminOk) {
    me.textContent += '（管理者権限がありません）';
    alert('管理者ではありません。'); 
    return;
  } else {
    me.textContent += '（管理者）';
  }

  const listEl = document.getElementById('list');
  const qEl = document.getElementById('q');
  const gEl = document.getElementById('qGenre');

  async function search() {
    let req = sb.from('reviews')
      .select('id, title, product_name, genre, score, author_name, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    const q = qEl.value.trim();
    const g = gEl.value;

    if (q) {
      // タイトル・商品名のどちらかヒット
      req = req.or(`title.ilike.%${q}%,product_name.ilike.%${q}%`);
    }
    if (g) req = req.eq('genre', g);

    const { data, error } = await req;
    if (error) {
      listEl.innerHTML = `<div class="text-red-600">取得エラー: ${error.message}</div>`;
      return;
    }

    if (!data?.length) {
      listEl.innerHTML = `<div class="meta py-6">該当がありません</div>`;
      return;
    }

    listEl.innerHTML = data.map(r => {
      const dt = new Date(r.created_at).toLocaleString();
      return `
      <div class="py-3 flex items-start gap-3">
        <div class="w-16 shrink-0 text-xs text-gray-500">${dt}</div>
        <div class="flex-1">
          <div class="font-bold">${r.title}</div>
          <div class="text-sm text-gray-600">${r.product_name} / ${r.genre} / 得点 ${r.score} / ${r.author_name || '匿名'}</div>
          <div class="flex gap-2 mt-1">
            <a class="btn-outline text-xs" href="review.html?id=${r.id}" target="_blank">表示</a>
            <button class="btn-danger text-xs" data-del="${r.id}">削除</button>
          </div>
        </div>
      </div>`;
    }).join('');

    // 削除ハンドラ
    listEl.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del');
        if (!confirm('本当に削除しますか？（元に戻せません）')) return;
        // RPC 経由で削除（管理者だけが通る）
        const { error } = await sb.rpc('admin_delete_review', { _review_id: id });
        if (error) {
          alert('削除失敗: ' + error.message);
        } else {
          alert('削除しました。');
          await search();
        }
      });
    });
  }

  document.getElementById('btnSearch')?.addEventListener('click', search);
  await search();
});
