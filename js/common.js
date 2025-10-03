// js/common.js —— フル置換版（GENRES / Supabase 初期化 / 共通UI / カード / 画像フィット / ジャンル自動投入）

/* ==== カテゴリ（全ページ共通で使う） ==== */
window.GENRES = [
  'ゲーム','漫画','アニメ','音楽','書籍','映画','ドラマ',
  'ソフトウェア','IT関連','DIY関連','飲食','ファッション','その他'
];

/* ==== Supabase 初期化 ==== */
// 既に window.sb があれば再生成しない。
// URLやKEYは、既存のグローバル値(window.SUPABASE_URL 等)があればそれを優先。
// 何も無ければプレースホルダ。あなたのプロジェクトの実値に置き換えてOK。
(function initSupabase() {
  if (window.sb) return;
  const url = window.SUPABASE_URL || 'Project URL
https://ovkumzhdxjljukfqchvu.supabase.co';
  const anon = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92a3VtemhkeGpsanVrZnFjaHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0NTMwMjcsImV4cCI6MjA3NTAyOTAyN30.MOzQtbiP9Ac1QA1Tsk9A3bvu5wHUvv3ggUd8l-jSvcw';
  if (!window.supabase) {
    console.error('Supabase SDK が読み込まれていません。<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> を <head> に入れてください。');
    return;
  }
  window.sb = window.supabase.createClient(url, anon);
})();

/* ==== ユーティリティ ==== */
window.qs = (key, def = null) => new URLSearchParams(location.search).get(key) ?? def;

/* ==== 一覧カード（画像に data-fit="auto"） ==== */
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
      <div class="title u-break">${r.title}</div>
      <div class="meta u-break">${r.product_name} / ${r.author_name || '匿名'}</div>
    </div>
    <div class="text-2xl font-bold">${r.score}</div>
  </a>`;
};

/* ==== カード（統計を内包：表示数/いいね/コメント） ==== */
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
      <div class="title u-break">${r.title}</div>
      <div class="meta u-break">${r.product_name} / ${r.author_name || '匿名'}</div>
      <div class="card-stats">
        <span>表示数: ${views ?? 0}</span>
        <span>いいね: ${likes ?? 0}</span>
        <span>コメント: ${comments ?? 0}</span>
      </div>
    </div>
    <div class="text-2xl font-bold">${r.score}</div>
  </a>`;
};

/* ==== 画像の縦横比で表示方式を自動切替（fit-w / fit-h） ==== */
window.fitThumbs = (root = document) => {
  const imgs = [...root.querySelectorAll('img[data-fit="auto"]')];
  imgs.forEach(img => {
    const apply = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) return;
      img.classList.remove('fit-w', 'fit-h');
      if (w > h) img.classList.add('fit-w');      // 横長→幅優先
      else if (h > w) img.classList.add('fit-h'); // 縦長→高さ優先
      // 正方形は cover のまま
    };
    if (img.complete) apply();
    else img.addEventListener('load', apply, { once: true });

    img.addEventListener('error', () => {
      img.removeAttribute('src');
      img.src = 'https://placehold.co/128x128?text=No+Image';
    }, { once: true });
  });
};

/* ==== ヘッダー：ログイン/ログアウト切替 ＋ 管理リンク挿入（マイページとログインの間） ==== */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const sb = window.sb;
    if (!sb) return;

    const { data: { user } } = await sb.auth.getUser();

    // ログイン/ログアウト切替
    const loginLink = document.getElementById('loginLink')
      || document.querySelector('header a[href*="auth"]');
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

    // 管理リンク（is_admin RPC を使う実装を想定。失敗しても無視）
    try {
      const { data: isAdmin, error } = await sb.rpc?.('is_admin'); // boolean を返す想定
      if (!error && isAdmin) {
        const nav = document.getElementById('navRight')
          || document.querySelector('header nav')
          || document.querySelector('header .mx');
        if (nav) {
          const loginEl = document.getElementById('loginLink')
            || nav.querySelector('a[href*="auth"]');
          const myEl = document.getElementById('myLink')
            || nav.querySelector('a[href*="my.html"]');

          // 既に存在していなければ挿入
          let adminEl = nav.querySelector('.nav-admin');
          if (!adminEl) {
            adminEl = document.createElement('a');
            adminEl.href = 'admin.html';
            adminEl.className = 'btn btn-outline nav-admin';
            adminEl.textContent = '管理';
          }

          // 「マイページとログインの間」に差し込み
          if (loginEl) {
            nav.insertBefore(adminEl, loginEl);
          } else if (myEl && myEl.parentNode) {
            myEl.parentNode.insertBefore(adminEl, myEl.nextSibling);
          } else {
            nav.appendChild(adminEl);
          }
        }
      }
    } catch (e) {
      console.warn('is_admin RPC 呼び出しに失敗しました（非管理か未定義）:', e?.message || e);
    }

  } catch (e) {
    console.error('ヘッダー初期化エラー:', e);
  }
});

/* ==== ジャンル<select> 自動投入（index.html 等のハードコーディングを置換） ==== */
/*
  対象：
  - <select id="qGenre">（検索フォーム）
  - <select id="rankGenre">（ランキングの絞り込み）
  - data-genres 属性が付いた <select>（任意のページ）
  使い方：
  - デフォルトで「すべて」やプレースホルダを入れたい場合は、先に<option>を1つ書いておくと保持されます。
    例）<select id="qGenre"><option value="">ジャンル：すべて</option></select>
*/
window.populateGenreSelects = () => {
  const sels = [
    ...document.querySelectorAll('select#qGenre, select#rankGenre, select[data-genres]')
  ];
  sels.forEach(sel => {
    // 先頭にデフォルト<option>が1つだけある場合は保持
    const defaultOpt = sel.options.length === 1 ? sel.options[0] : null;
    const current = sel.value;

    // 一旦クリア
    sel.innerHTML = '';

    // 先頭の既定表示（あれば）
    if (defaultOpt) {
      sel.appendChild(defaultOpt);
    } else {
      // id でメッセージを変える（任意）
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = sel.id === 'qGenre' ? 'ジャンル：すべて' :
                        sel.id === 'rankGenre' ? 'すべて' : '選択してください';
      sel.appendChild(opt);
    }

    // GENRES から投入
    window.GENRES.forEach(g => {
      const o = document.createElement('option');
      o.value = g;
      o.textContent = g;
      sel.appendChild(o);
    });

    // 可能なら元の選択値を復元
    if (current && [...sel.options].some(o => o.value === current)) {
      sel.value = current;
    }
  });
};

// DOM 準備完了で自動投入
document.addEventListener('DOMContentLoaded', () => {
  try { window.populateGenreSelects(); } catch (e) { console.warn(e); }
});
