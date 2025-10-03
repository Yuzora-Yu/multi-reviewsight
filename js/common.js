// ----- サイト共通設定 -----
window.GENRES = ['ゲーム','漫画','アニメ','音楽','書籍','映画','ドラマ','ソフトウェア','IT関連','DIY関連','ファッション','その他'];
window.APP_BASE_ABS = 'https://yuzora-yu.github.io/multi-reviewsight/';

// Supabase 接続
const SUPABASE_URL = 'https://ovkumzhdxjljukfqchvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92a3VtemhkeGpsanVrZnFjaHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0NTMwMjcsImV4cCI6MjA3NTAyOTAyN30.MOzQtbiP9Ac1QA1Tsk9A3bvu5wHUvv3ggUd8l-jSvcw';

// ★ ここがポイント：window.supabase ではなく window.sb を使う
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// URLヘルパー / SHA-256 / X投稿（既存のままでOK）
window.appUrl = (p) => new URL(p, window.APP_BASE_ABS).toString();
window.sha256hex = async (text) => {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
};
window.openTweetIntent = (url, text='レビューを投稿しました！', hashtags=['レビュー']) => {
  const u = new URL('https://twitter.com/intent/tweet');
  u.searchParams.set('url', url);
  if (text) u.searchParams.set('text', text);
  if (hashtags?.length) u.searchParams.set('hashtags', hashtags.join(','));
  window.open(u.toString(), '_blank', 'noopener,noreferrer');
};

// ヘッダー：ログイン/ログアウト表示（ID=loginLink があるページ向け）
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = (await window.sb.auth.getUser()).data.user;
    const loginLink = document.getElementById('loginLink');
    if (!loginLink) return;
    if (user) {
      loginLink.textContent = 'ログアウト';
      loginLink.addEventListener('click', async (e) => {
        e.preventDefault();
        await window.sb.auth.signOut();
        location.reload();
      }, { once: true });
    } else {
      loginLink.textContent = 'ログイン / 登録';
      loginLink.href = 'auth.html';
    }
  } catch {}
});
