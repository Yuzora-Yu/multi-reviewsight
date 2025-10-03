document.addEventListener('DOMContentLoaded', async () => {
  const { supabase } = window;
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) { document.body.innerHTML = '<p>idがありません</p>'; return; }

  // 詳細取得
  const { data: r, error } = await supabase.from('reviews').select('*').eq('id', id).single();
  if (error || !r) { document.getElementById('review').textContent = '取得エラー'; return; }

  // 表示
  const container = document.getElementById('review');
  const img = r.product_image_url || 'https://placehold.co/128x128?text=No+Image';
  container.innerHTML = `
    <div class="flex gap-4">
      <img src="${img}" class="w-28 h-28 object-cover rounded bg-gray-100"/>
      <div class="flex-1">
        <div class="meta">${r.genre} | ${new Date(r.created_at).toLocaleString()}</div>
        <h1 class="text-xl font-bold">${r.title}</h1>
        <div class="meta">${r.product_name} / ${r.product_author || ''} / ${r.price_text || ''}</div>
        ${r.product_link_url ? `<a class="text-blue-700 underline" href="${r.product_link_url}" target="_blank">商品リンク</a>` : ''}
        <div class="mt-3 whitespace-pre-wrap">${r.body}</div>
        <div class="mt-2 text-sm text-gray-600">投稿者：${r.author_name || '匿名'}</div>
        <div class="mt-4">
          <button id="shareXBtn" class="btn-outline">Xで共有</button>
        </div>
      </div>
      <div class="text-3xl font-bold">${r.score}</div>
    </div>
  `;

  // 共有ボタン
  document.getElementById('shareXBtn').addEventListener('click', () => {
    const shareUrl = window.appUrl('review.html?id=' + id);
    window.openTweetIntent(shareUrl, `「${r.title}」レビュー`, ['レビュー']);
  });

  // 表示数インクリメント（Edge Function）
  try {
    await fetch('https://ovkumzhdxjljukfqchvu.supabase.co/functions/v1/view-hit?id=' + id);
  } catch {}

  // いいね数
  const refreshLike = async () => {
    const { count } = await supabase.from('review_likes').select('review_id', { count: 'exact', head: true }).eq('review_id', id);
    document.getElementById('likeCount').textContent = `いいね：${count || 0}`;
  };
  await refreshLike();

  // いいねボタン
  document.getElementById('likeBtn').addEventListener('click', async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) { alert('ログインしてください'); return; }
    const { data: me } = await supabase.from('review_likes').select('*').eq('review_id', id).eq('user_id', user.id).maybeSingle();
    if (me) {
      await supabase.from('review_likes').delete().eq('review_id', id).eq('user_id', user.id);
    } else {
      await supabase.from('review_likes').insert({ review_id: id, user_id: user.id });
    }
    await refreshLike();
  });

  // コメント一覧
  const loadComments = async () => {
    const { data } = await supabase.from('review_comments')
      .select('id, body, commenter_name, user_id, created_at')
      .eq('review_id', id)
      .order('created_at', { ascending: true });
    const wrap = document.getElementById('comments');
    wrap.innerHTML = (data || []).map(c => `
      <div class="border rounded p-2">
        <div class="meta">${new Date(c.created_at).toLocaleString()} / ${c.commenter_name || '匿名'}</div>
        <div class="whitespace-pre-wrap mt-1">${c.body}</div>
      </div>
    `).join('') || '<div class="meta">まだコメントはありません</div>';
  };
  await loadComments();

  // コメント投稿
  document.getElementById('commentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) { alert('ログインしてください'); return; }
    const body = DOMPurify.sanitize(document.getElementById('commentBody').value.trim());
    if (!body) return;
    const name = document.getElementById('commenterName').value.trim();
    const { error } = await supabase.from('review_comments').insert({
      review_id: id, body, commenter_name: name || null, user_id: user.id
    });
    if (error) { alert(error.message); return; }
    document.getElementById('commentBody').value = '';
    await loadComments();
  });

  // 編集・削除
  document.getElementById('deleteBtn').addEventListener('click', async () => {
    if (!confirm('削除しますか？')) return;
    const pass = document.getElementById('editPassword').value;
    const passHash = pass ? await window.sha256hex(pass) : null;

    // ログイン本人なら直接削除
    const user = (await supabase.auth.getUser()).data.user;
    if (user && r.author_user_id === user.id) {
      const { error } = await supabase.from('reviews').delete().eq('id', id);
      if (error) return alert(error.message);
      alert('削除しました'); location.href = './'; return;
    }

    // パスワードで削除（Edge Function）
    if (!passHash) return alert('パスワードが必要です');
    const resp = await fetch('https://ovkumzhdxjljukfqchvu.supabase.co/functions/v1/edit-by-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'delete', review_id: id, pass_hash: passHash })
    });
    if (!resp.ok) return alert('削除失敗');
    alert('削除しました'); location.href = './';
  });

  document.getElementById('editBtn').addEventListener('click', async () => {
    const newTitle = prompt('新しいタイトル（20文字まで）', r.title);
    if (!newTitle) return;
    const pass = document.getElementById('editPassword').value;
    const passHash = pass ? await window.sha256hex(pass) : null;

    // 本人なら直接更新
    const user = (await supabase.auth.getUser()).data.user;
    if (user && r.author_user_id === user.id) {
      const { error } = await supabase.from('reviews').update({ title: newTitle }).eq('id', id);
      if (error) return alert(error.message);
      alert('更新しました'); location.reload(); return;
    }

    // パスワードで更新（Edge Function）
    if (!passHash) return alert('パスワードが必要です');
    const resp = await fetch('https://ovkumzhdxjljukfqchvu.supabase.co/functions/v1/edit-by-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'update', review_id: id, pass_hash: passHash, patch: { title: newTitle } })
    });
    if (!resp.ok) return alert('更新失敗');
    alert('更新しました'); location.reload();
  });
});
