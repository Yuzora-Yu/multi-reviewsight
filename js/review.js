// js/review.js —— フル置換
// 3段構成：上=詳細・中=いいね＋コメント投稿・下=コメント履歴（20件ページング）

document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.sb;
  const id = window.qs('id');
  if (!id) {
    document.body.innerHTML = '<main class="mx-auto max-w-3xl p-6">idがありません</main>';
    return;
  }

  // ========= 1) 詳細の取得＆描画 =========
  const { data: r, error } = await sb.from('reviews').select('*').eq('id', id).single();
  if (error || !r) {
    document.getElementById('detailSection').innerHTML = `<div class="meta">取得エラー：${error?.message ?? 'not found'}</div>`;
    return;
  }

  // 表示テンプレ
  const detailEl = document.getElementById('detailSection');
  const img = r.product_image_url || 'https://placehold.co/160x160?text=No+Image';
  const productBtn = r.product_link_url
    ? `<a class="btn" href="${r.product_link_url}" target="_blank" rel="noopener">商品ページへ</a>`
    : '';
  detailEl.innerHTML = `
    <div class="flex gap-5 items-start">
      <img src="${img}" class="w-32 h-32 object-cover rounded bg-gray-100" alt="">
      <div class="flex-1">
        <div class="meta">${r.genre} ｜ ${new Date(r.created_at).toLocaleString()}</div>
        <h1 class="text-2xl font-bold mt-1">${r.title}</h1>
        <div class="meta mt-1">${r.product_name}${r.product_author ? ' / ' + r.product_author : ''}${r.price_text ? ' / ' + r.price_text : ''}</div>
        <div class="mt-3 whitespace-pre-wrap">${r.body}</div>
        <div class="mt-3 text-sm text-gray-600">投稿者：${r.author_name || '匿名'}</div>
        <div class="mt-4 flex gap-3">
          ${productBtn}
          <button id="shareXBtn" class="btn-outline">Xで共有</button>
        </div>
      </div>
      <div class="text-4xl font-bold">${r.score}</div>
    </div>
  `;

  // 共有
  document.getElementById('shareXBtn').addEventListener('click', () => {
    const shareUrl = window.appUrl('review.html?id=' + id);
    window.openTweetIntent(shareUrl, `「${r.title}」レビュー`, ['レビュー']);
  });

  // 表示数カウント（失敗しても無視）
  try {
    await fetch('https://ovkumzhdxjljukfqchvu.supabase.co/functions/v1/view-hit?id=' + id);
  } catch {}

  // ========= 2) いいねUI（トグル） =========
  const likeBtn = document.getElementById('likeBtn');
  const likeCountEl = document.getElementById('likeCount');

  async function getLikeState() {
    const { data: { user } } = await sb.auth.getUser();
    const { count } = await sb.from('review_likes').select('review_id', { count: 'exact', head: true }).eq('review_id', id);
    let mine = false;
    if (user) {
      const { data: liked } = await sb.from('review_likes')
        .select('review_id').eq('review_id', id).eq('user_id', user.id).maybeSingle();
      mine = !!liked;
    }
    return { count: count || 0, mine };
  }

  async function refreshLike() {
    const { count, mine } = await getLikeState();
    likeCountEl.textContent = `いいね：${count}`;
    likeBtn.textContent = mine ? '♥ いいね取り消し' : '♡ いいね';
    likeBtn.classList.toggle('btn', !mine);
    likeBtn.classList.toggle('btn-outline', mine);
  }

  likeBtn.addEventListener('click', async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.toast('いいねはログインが必要です'); return; }
    const { data: liked } = await sb.from('review_likes')
      .select('review_id').eq('review_id', id).eq('user_id', user.id).maybeSingle();
    if (liked) {
      await sb.from('review_likes').delete().eq('review_id', id).eq('user_id', user.id);
    } else {
      await sb.from('review_likes').insert({ review_id: id, user_id: user.id });
    }
    await refreshLike();
  });

  await refreshLike();

  // ========= 3) コメント投稿（中央） =========
  const nameSpan = document.getElementById('commentDisplayName');
  const commentForm = document.getElementById('commentForm');
  const commentBody = document.getElementById('commentBody');
  const toAuth = document.getElementById('toAuth');
  const commentNotice = document.getElementById('commentNotice');

  async function prepareCommentBox() {
    const name = await window.getDisplayName();
    if (name) {
      nameSpan.textContent = name;
      toAuth.classList.add('hidden');
      commentNotice.classList.add('hidden');
      commentBody.disabled = false;
    } else {
      nameSpan.textContent = '（未ログイン）';
      toAuth.classList.remove('hidden');
      commentNotice.classList.remove('hidden');
      commentBody.disabled = true;
    }
  }
  await prepareCommentBox();

  commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.toast('ログインしてください'); return; }

    const displayName = await window.getDisplayName();
    const body = DOMPurify.sanitize(commentBody.value.trim());
    if (!body) return;

    const { error: insErr } = await sb.from('review_comments').insert({
      review_id: id,
      user_id: user.id,
      commenter_name: displayName || null,
      body
    });
    if (insErr) { window.toast('コメント失敗：' + insErr.message); return; }

    commentBody.value = '';
    await loadComments(currentPage); // 再読込
  });

  // ========= 4) コメント履歴（下）20件ページング =========
  const listEl = document.getElementById('commentList');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');

  const PAGE_SIZE = 20;
  let currentPage = 1;
  let totalPages = 1;

  async function loadComments(page = 1) {
    // 件数
    const { count: total } = await sb
      .from('review_comments')
      .select('id', { count: 'exact', head: true })
      .eq('review_id', id);
    totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, page), totalPages);

    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error: listErr } = await sb
      .from('review_comments')
      .select('id, body, commenter_name, created_at')
      .eq('review_id', id)
      .order('created_at', { ascending: true })
      .range(from, to);

    if (listErr) {
      listEl.innerHTML = `<div class="meta">取得エラー：${listErr.message}</div>`;
      return;
    }

    pageInfo.textContent = `${currentPage} / ${totalPages}`;

    listEl.innerHTML = (data || []).map(c => {
      const t = new Date(c.created_at);
      const time = `${t.getFullYear()}/${String(t.getMonth()+1).padStart(2,'0')}/${String(t.getDate()).padStart(2,'0')} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
      const name = c.commenter_name || '匿名';
      return `
        <div class="border rounded p-3">
          <div class="meta">${time} ｜ ${name}</div>
          <div class="whitespace-pre-wrap mt-1">${c.body}</div>
        </div>
      `;
    }).join('') || '<div class="meta">まだコメントはありません</div>';

    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  }

  prevBtn.addEventListener('click', async () => {
    if (currentPage > 1) await loadComments(currentPage - 1);
  });
  nextBtn.addEventListener('click', async () => {
    if (currentPage < totalPages) await loadComments(currentPage + 1);
  });

  await loadComments(1);
});
