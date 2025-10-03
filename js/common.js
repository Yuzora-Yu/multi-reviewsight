// js/common.js —— フル置換版（GENRES あり）

// ==== カテゴリ（全ページ共通で使えるように window に） ====
window.GENRES = [
  'ゲーム','漫画','アニメ','音楽','書籍','映画','ドラマ',
  'ソフトウェア','IT関連','DIY関連','ファッション','その他'
];

// ==== Supabase 接続（固定） ====
const SUPABASE_URL = 'https://ovkumzhdxjljukfqchvu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92a3VtemhkeGpsanVrZnFjaHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0NTMwMjcsImV4cCI6MjA3NTAyOTAyN30.MOzQtbiP9Ac1QA1Tsk9A3bvu5wHUvv3ggUd8l-jSvcw';

// SDK のファクトリ(window.supabase)からクライアントを作り、window.sb に固定
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==== サイト共通 ====
window.APP_BASE_ABS = 'https://yuzora-yu.github.io/multi-reviewsight/';

// クエリ取得
window.qs = (key, def = null) => new URLSearchParams(location.search).get(key) ?? def;

// SHA-256(hex)
window.sha256hex = async (text) => {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};

// X共有Intent
window.openTweetIntent = (url, text = 'レビューを投稿しました！', hashtags = ['レビュー']) => {
  const u = new URL('https://twitter.com/intent/tweet');
  u.searchParams.set('url', url);
  if (text) u.searchParams.set('text', text);
  if (hashtags?.length) u.searchParams.set('hashtags', hashtags.join(','));
  window.open(u.toString(), '_blank');
};

// トースト
window.toast = (msg) => {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
};

// --- Display Name の取得（共通で使う） ---
window.getDisplayName = async () => {
  const { data: { user } } = await window.sb.auth.getUser();
  if (!user) return null;

  // profiles から取得（なければメールIDを暫定返し）
  const { data, error } = await window.sb
    .from('profiles')
    .select('display_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('profiles fetch error:', error.message);
  }
  const emailName = user.email ? user.email.split('@')[0] : 'ユーザー';
  return data?.display_name || emailName;
};

// 一覧カード（トップ/マイページ用）
window.reviewCard = (r) => {
  const img = r.product_image_url || 'https://placehold.co/128x128?text=No+Image';
  const url = `review.html?id=${r.id}`;
  return `
  <a class="card" href="${url}">
    <div class="mediaBox">
      <img src="${img}" alt="" data-fit="auto">
    </div>
    <div class="flex-1">
      <div class="meta">${r.genre}｜${new Date(r.created_at).toLocaleDateString()}</div>
      <div class="title">${r.title}</div>
      <div class="meta">${r.product_name} / ${r.author_name || '匿名'}</div>
    </div>
    <div class="text-2xl font-bold">${r.score}</div>
  </a>`;
};

// カード内に表示数/いいね/コメントを含めたバージョン
window.reviewCardWithStats = (r, { views = 0, likes = 0, comments = 0 } = {}) => {
  const img = r.product_image_url || 'https://placehold.co/128x128?text=No+Image';
  const url = `review.html?id=${r.id}`;
  return `
  <a class="card" href="${url}">
    <div class="mediaBox">
      <img src="${img}" alt="" data-fit="auto">
    </div>
    <div class="flex-1">
      <div class="meta">${r.genre}｜${new Date(r.created_at).toLocaleDateString()}</div>
      <div class="title">${r.title}</div>
      <div class="meta">${r.product_name} / ${r.author_name || '匿名'}</div>

      <!-- 統計行（カード内フッター） -->
      <div class="card-stats">
        <span>表示数: ${views ?? 0}</span>
        <span>いいね: ${likes ?? 0}</span>
        <span>コメント: ${comments ?? 0}</span>
      </div>
    </div>
    <div class="text-2xl font-bold">${r.score}</div>
  </a>`;
};

// --- ヘッダー（ログイン/ログアウト切替 + 管理リンク） ---
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const sb = window.sb;
    const { data: { user } } = await sb.auth.getUser();

    // ログイン/ログアウト切替
    const loginLink = document.getElementById('loginLink');
    if (loginLink) {
      if (user) {
        loginLink.textContent = 'ログアウト';
        loginLink.addEventListener('click', async (e) => {
          e.preventDefault();
          await sb.auth.signOut();
          location.reload();
        });
      } else {
        loginLink.textContent = 'ログイン / 登録';
        loginLink.setAttribute('href', 'auth.html');
      }
    }

    // 管理者のみ「管理」ナビを表示
    if (user) {
      try {
        // DBの is_admin() 関数をRPCで呼ぶ（SQLは前に追加済み）
        const { data: isAdmin, error } = await sb.rpc('is_admin');
        if (!error && isAdmin) {
          const nav = document.querySelector('header nav');
          if (nav && !nav.querySelector('[data-admin-link]')) {
            const a = document.createElement('a');
            a.href = 'admin.html';
            a.className = 'btn-outline';
            a.textContent = '管理';
            a.setAttribute('data-admin-link', '1');
            nav.appendChild(a);
          }
        }
      } catch (e) {
        console.warn('is_admin RPC error:', e);
      }
    }

    console.log('Supabase reachable.');
  } catch (e) {
    alert('ネットワークまたは設定エラーでDBに到達できませんでした');
    console.error(e);
  }
});

// ==== 画像の縦横比で表示方式を自動切り替え ====
window.fitThumbs = (root = document) => {
  const imgs = [...root.querySelectorAll('img[data-fit="auto"]')];
  imgs.forEach(img => {
    const apply = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) return;
      img.classList.remove('fit-w', 'fit-h');
      if (w > h) img.classList.add('fit-w');      // 横長→幅優先
      else if (h > w) img.classList.add('fit-h'); // 縦長→高さ優先
      // 正方形はデフォルト（cover）のまま
    };
    if (img.complete) apply();
    else img.addEventListener('load', apply, { once: true });

    // 画像エラー時のフォールバック
    img.addEventListener('error', () => {
      img.removeAttribute('src');
      img.src = 'https://placehold.co/128x128?text=No+Image';
    }, { once: true });
  });
};

