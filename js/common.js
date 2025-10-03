// ----- js/common.js（置き換え） -----

// GitHub Pages の絶対ベースURL（X共有などに使用）
window.APP_BASE_ABS = 'https://yuzora-yu.github.io/multi-reviewsight/';

// Supabase 接続情報
const SUPABASE_URL = 'https://ovkumzhdxjljukfqchvu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92a3VtemhkeGpsanVrZnFjaHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0NTMwMjcsImV4cCI6MjA3NTAyOTAyN30.MOzQtbiP9Ac1QA1Tsk9A3bvu5wHUvv3ggUd8l-jSvcw';

// supabase-js が読み込めているかチェック
if (!('supabase' in window) || !window.supabase?.createClient) {
  alert('Supabase SDK の読込に失敗しました。<script>の順序を確認してください。');
  throw new Error('supabase-js not loaded');
}

// クライアント生成（名前の衝突を避け、明示的に window.sb に格納）
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 便利関数
window.GENRES = ['ゲーム','漫画','アニメ','書籍','映画','ドラマ','IT','DIY','ファッション','その他'];
window.appUrl = (pathAndQuery) => new URL(pathAndQuery, window.APP_BASE_ABS).toString();
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
  window.open(u.toString(), '_blank');
};
window.reviewCard = (r) => {
  const img = r.product_image_url || 'https://placehold.co/128x128?text=No+Image';
  const url = `review.html?id=${r.id}`;
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

// ヘッダーのログイン/ログアウト表示（任意）
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { data: { user } } = await window.sb.auth.getUser();
    const loginLink = document.getElementById('loginLink');
    if (loginLink) loginLink.textContent = user ? 'ログアウト' : 'ログイン';
    if (loginLink && user) {
      loginLink.addEventListener('click', async (e) => {
        e.preventDefault();
        await window.sb.auth.signOut();
        location.reload();
      });
    }
  } catch (e) {
    console.warn('auth state check failed:', e);
  }
});

// --- 接続の健全性チェック（最初の画面で分かるように） ---
(async () => {
  try {
    // 軽い HEAD 相当のクエリで疎通を確認
    const { error } = await window.sb
      .from('reviews')
      .select('id', { head: true, count: 'exact' })
      .limit(1);

    if (error) {
      // RLS/権限エラー or URL/Key ミス
      console.error('Supabase error:', error);
      // 日本語アラート（あなたのスクショ文言に合わせています）
      alert('ネットワークまたは設定エラーでDBに到達できませんでした\n\n' +
            `詳細: ${error.message || 'unknown error'}`);
    } else {
      console.log('Supabase reachable.');
    }
  } catch (e) {
    console.error('Supabase init failed:', e);
    alert('ネットワークまたは設定エラーでDBに到達できませんでした');
  }
})();
