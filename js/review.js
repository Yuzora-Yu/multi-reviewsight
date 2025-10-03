// js/review.js —— フル置換

document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.sb;
  const id = window.qs('id');
  if (!id) { document.body.innerHTML = '<p>idがありません</p>'; return; }

  // 詳細取得
  const { data: r, error } = await sb.from('reviews').select('*').eq('id', id).single();
  if (error || !r) { document.getElementById('review').textContent = '取得エラー'; return; }

  // 表示
  const container = document.getElementById('review');
  const img = r.product_image_url || 'https://placehold.co/128x128?text=No+Image';
  container.innerHTML = `
    <div class="card" style="gap:16px">
      <img src="${img}" class="w-28 h-28 object-cover"/>
      <div class="flex-1">
        <div class="meta">${r.genre} ｜ ${new Date(r.created_at).toLocaleString()}</div>
        <h1 class="text-xl font-bold">${r.title}</h1>
        <div class="meta">${r.product_name} / ${r.product_author || ''} / ${r.price_text || ''}</div>
        ${r.product_link_url ? `<a class="underline" href="${r.product_link_url}" target="_blank">商品リンク</a>` : ''}
        <div class="mt-3 whitespace-pre-wrap" id="revBody"></div>
        <div class="mt-2 text-sm text-gray-400">投稿者：${r.author_name || '匿名'}</div>
        <div class="mt-4">
          <button id="shareXBtn" class="btn-outline">Xで共有</button>
        </div>
      </div>
      <div class="text-3xl font-bold">${r.score}</div>
    </div>
  `;
  // 本文はサニタイズ済みで保存している前提。念のため textContent→安全な表示。
  document.getElementById('revBody').textContent = r.body;

  // 共有
  document.getElementById('shareXBtn').addEventListener('click', () => {
    const shareUrl = new URL('review.html?id=' + id, window.APP_BASE_ABS).toString();
    window.openTweetIntent(shareUrl, `「${r.title}」レビュー`, ['レビュー']);
  });

  // 表示数カウント
  try { await fetch('https://ovkumzhdxjljukfqchvu.supabase.co/functions/v1/view-hit?id=' + id); } catch {}

  // ====== いいね ======
  const likeCountEl = document.getElementById('likeCount');
  const refreshLike = async () => {
    const { count } = await sb.from('review_likes')
      .select('review_id', { count: 'exact', head: true })
      .eq('review_id', id);
    likeCountEl.textContent = `いいね：${count || 0}`;
  };
  await refreshLike();

  document.getElementById('likeBtn').addEventListener('click', async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return window.toast('ログインしてください');
    const { data: exists } = await sb.from('review_likes')
      .select('review_id').eq('review_id', id).eq('user_id', user.id).maybeSingle();
    if (exists) {
      await sb.from('review_likes').delete().eq('review_id', id).eq('user_id', user.id);
    } else {
      await sb.from('review_likes').insert({ review_id: id, user_id: user.id });
    }
    await refreshLike();
  });

  // ====== コメント（20件/ページ） ======
  const pageSize = 20;
  let page = 0;

  const fixedNameEl = document.getElementById('fixedName');
  const displayName = await window.getDisplayName();
  fixedNameEl.textContent = `表示名: ${displayName ?? '（未ログイン）'}`;

  const renderComments = async () => {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    // 古い順（掲示板風）
    const { data, error } = await sb.from('review_comments')
      .select('id, body, commenter_name, user_id, created_at')
      .eq('review_id', id)
      .order('created_at', { ascending: true })
      .range(from, to);
    const wrap = document.getElementById('comments');
    if (error) { wrap.innerHTML = `<div class="meta">コメント取得エラー</div>`; return; }
    wrap.innerHTML = (data || []).map(c => `
      <div class="card" style="padding:10px 12px">
        <div class="meta">${new Date(c.created_at).toLocaleString()}　｜　${c.commenter_name || '匿名'}</div>
        <div class="mt-1 whitespace-pre-wrap">${c.body}</div>
      </div>
    `).join('') || '<div class="meta">まだコメントはありません</div>';

    document.getElementById('pageInfo').textContent = `ページ ${page + 1}`;
  };
  await renderComments();

  document.getElementById('prevPage').addEventListener('click', async () => {
    if (page > 0) { page--; await renderComments(); }
  });
  document.getElementById('nextPage').addEventListener('click', async () => {
    // 次ページにデータがあるか軽く確認
    const from = (page + 1) * pageSize;
    const to = from + pageSize - 1;
    const { data } = await sb.from('review_comments')
      .select('id', { count: 'exact' })
      .eq('review_id', id).order('created_at', { ascending: true }).range(from, to);
    if (data && data.length) { page++; await renderComments(); }
  });

  // 投稿
  document.getElementById('commentForm').addEventListener('submit', async (e) => {
    e.preventDefault(); // ← これが無いと「idがありません」など変な遷移の原因に
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return window.toast('ログインしてください');

    const body = (document.getElementById('commentBody').value || '').trim();
    if (!body) return;

    const commenterName = await window.getDisplayName(); // プロフィール名固定
    const { error } = await sb.from('review_comments').insert({
      review_id: id,
      user_id: user.id,
      commenter_name: commenterName || null,
      body
    });
    if (error) { window.toast('投稿に失敗しました'); console.error(error); return; }
    document.getElementById('commentBody').value = '';
    await renderComments();
  });
});
