// 接続ヘルスチェック（起動時に一度だけ）
(async () => {
  try {
    const { error } = await window.supabase.from('reviews').select('id').limit(1);
    if (error) {
      console.error('Supabase接続エラー:', error);
      alert('データ取得エラー: ' + (error.message || 'unknown'));
    }
  } catch (e) {
    console.error('致命的: Supabaseに到達できません', e);
    alert('ネットワークまたは設定エラーでDBに到達できませんでした');
  }
})();

// ----- サイト共通設定 -----
window.GENRES = ['ゲーム','漫画','アニメ','書籍','映画','ドラマ','IT','DIY','ファッション','その他'];

// GitHub Pages の絶対ベースURL（X共有などに使う）
window.APP_BASE_ABS = 'https://yuzora-yu.github.io/multi-reviewsight/';

// Supabase 接続情報（あなたの値）
const SUPABASE_URL = 'https://ovkumzhdxjljukfqchvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92a3VtemhkeGpsanVrZnFjaHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0NTMwMjcsImV4cCI6MjA3NTAyOTAyN30.MOzQtbiP9Ac1QA1Tsk9A3bvu5wHUvv3ggUd8l-jSvcw';

// Supabaseクライアント（CDNのsupabase-jsを使用）
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 絶対URLを作る
window.appUrl = (pathAndQuery) => new URL(pathAndQuery, window.APP_BASE_ABS).toString();

// 文字列→SHA-256(hex)
window.sha256hex = async (text) => {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
};

// X（Twitter）Intent
window.openTweetIntent = (url, text='レビューを投稿しました！', hashtags=['レビュー']) => {
  const u = new URL('https://twitter.com/intent/tweet');
  u.searchParams.set('url', url);
  if (text) u.searchParams.set('text', text);
  if (hashtags?.length) u.searchParams.set('hashtags', hashtags.join(','));
  window.open(u.toString(), '_blank');
};

// 一覧用カードHTML
window.reviewCard = (r) => {
  const img = r.product_image_url || 'https://placehold.co/128x128?text=No+Image';
  const url = `review.html?id=${r.id}`; // <base>で /multi-reviewsight/ 起点になる
  return `<a class="card" href="${url}">
    <img src="${img}" alt="image" />
    <div class="flex-1">
      <div class="meta">${r.genre} | ${new Date(r.created_at).toLocaleDateString()}</div>
      <div class="title">${r.title}</div>
      <div class="meta">${r.product_name} / ${r.author_name || '匿名'}</div>
    </div>
    <div class="text-2xl font-bold">${r.score}</div>
  </a>`;
};

// ヘッダーの「ログイン/ログアウト」表示切替（任意）
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = (await window.supabase.auth.getUser()).data.user;
    const loginLink = document.getElementById('loginLink');
    if (loginLink) loginLink.textContent = user ? 'ログアウト' : 'ログイン';
    if (loginLink && user) {
      loginLink.addEventListener('click', async (e) => {
        e.preventDefault();
        await window.supabase.auth.signOut();
        location.reload();
      });
    }
  } catch {}
});
