// js/admin.js
document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.sb;

  // 認証 & 管理者チェック
  const { data: { user } } = await sb.auth.getUser();
  const me = document.getElementById('me');
  if (!user) {
    me.textContent = '未ログインです。ログイン後に再度アクセスしてください。';
    return;
  }
  me.textContent = `ログイン中: ${user.email}`;

  const { data: isAdmin, error: adminErr } = await sb.rpc('is_admin');
  if (adminErr || !isAdmin) {
    me.textContent += '（管理者権限がありません）';
    alert('管理者ではありません。');
    return;
  } else {
    me.textContent += '（管理者）';
  }

  // タブUI
  const tabs = document.querySelectorAll('.tab');
  const panels = {
    reviews: document.getElementById('tab-reviews'),
    comments: document.getElementById('tab-comments'),
  };
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const id = btn.getAttribute('data-tab');
      Object.entries(panels).forEach(([k, el]) => el.classList.toggle('hidden', k !== id));
    });
  });

  // ===== レビュー管理 =====
  const listEl = document.getElementById('list');
  const qEl = document.getElementById('q');
  const gEl = document.getElementById('qGenre');

  async function searchReviews() {
    let req = sb.from('reviews')
      .select('id, title, product_name, genre, score, author_name, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    const q = qEl.value.trim();
    const g = gEl.value;

    if (q) req = req.or(`title.ilike.%${q}%,product_name.ilike.%${q}%`);
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
        <div class="w-40 shrink-0 text-xs text-gray-500">${dt}</div>
        <div class="flex-1">
          <div class="font-bold">${r.title}</div>
          <div class="text-sm text-gray-600">${r.product_name} / ${r.genre} / 得点 ${r.score} / ${r.author_name || '匿名'}</div>
          <div class="flex gap-2 mt-1">
            <a class="btn-outline text-xs" href="review.html?id=${r.id}" target="_blank">表示</a>
            <button class="btn-danger text-xs" data-del="${r.id}">レビュー削除</button>
          </div>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del');
        if (!confirm('本当にこのレビューを削除しますか？（元に戻せません）')) return;
        const { error } = await sb.rpc('admin_delete_review', { _review_id: id });
        if (error) {
          alert('削除失敗: ' + error.message);
        } else {
          alert('削除しました。');
          await searchReviews();
        }
      });
    });
  }
  document.getElementById('btnSearch')?.addEventListener('click', searchReviews);
  await searchReviews();

  // ===== コメント管理 =====
  const cList = document.getElementById('clist');
  const cText = document.getElementById('cText');
  const cReviewId = document.getElementById('cReviewId');
  const cEmail = document.getElementById('cEmail');

  async function searchComments() {
    let req = sb.from('review_comments')
      .select('id, review_id, body, commenter_name, user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    const kw = cText.value.trim();
    const rid = cReviewId.value.trim();
    const email = cEmail.value.trim();

    if (kw) {
      // コメント本文 or 表示名（commenter_name）に部分一致
      req = req.or(`body.ilike.%${kw}%,commenter_name.ilike.%${kw}%`);
    }
    if (rid) req = req.eq('review_id', rid);

    // email で絞り込みたい場合は auth.users を直接参照できないので
    // とりあえず user_id はそのまま表示。email が欲しい時は別UIで profiles と突合する設計に。
    // ここでは簡易にスキップ／将来強化ポイント。

    const { data, error } = await req;
    if (error) {
      cList.innerHTML = `<div class="text-red-600">取得エラー: ${error.message}</div>`;
      return;
    }
    if (!data?.length) {
      cList.innerHTML = `<div class="meta py-6">該当がありません</div>`;
      return;
    }

    cList.innerHTML = data.map(c => {
      const dt = new Date(c.created_at).toLocaleString();
      return `
      <div class="py-3 flex items-start gap-3">
        <div class="w-40 shrink-0 text-xs text-gray-500">${dt}</div>
        <div class="flex-1">
          <div class="text-sm text-gray-600">
            <span class="font-mono">ReviewID:</span> ${c.review_id}
          </div>
          <div class="text-xs text-gray-500">
            <span class="font-mono">CommentID:</span> ${c.id}
            ／ <span class="font-mono">UserID:</span> ${c.user_id || '-'}
          </div>
          <div class="mt-1"><span class="font-bold">${c.commenter_name || '匿名'}</span></div>
          <div class="mt-1 whitespace-pre-wrap">${c.body}</div>
          <div class="flex gap-2 mt-2">
            <a class="btn-outline text-xs" href="review.html?id=${c.review_id}" target="_blank">該当レビュー表示</a>
            <button class="btn-danger text-xs" data-cdel="${c.id}">コメント削除</button>
          </div>
        </div>
      </div>`;
    }).join('');

    cList.querySelectorAll('[data-cdel]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-cdel');
        if (!confirm('このコメントを削除しますか？（元に戻せません）')) return;
        const { error } = await sb.rpc('admin_delete_comment', { _comment_id: id });
        if (error) {
          alert('削除失敗: ' + error.message);
        } else {
          alert('削除しました。');
          await searchComments();
        }
      });
    });
  }

  document.getElementById('btnCSearch')?.addEventListener('click', searchComments);
  // デフォルトは「レビュー管理」タブを開く。必要なら下の行を有効化
  // await searchComments();
});
