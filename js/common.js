// js/common.js — clean ASCII version (copy/paste safe)

// ===== Genres (shared across pages) =====
window.GENRES = [
  "ゲーム","漫画","アニメ","音楽","書籍","映画","ドラマ",
  "ソフトウェア","IT関連","飲食","ファッション","その他"
];

// ===== Supabase init =====
// If window.sb already exists (from older code), we reuse it.
// Otherwise, create it using your project credentials.
(function initSupabase() {
  try {
    if (window.sb) return; // already initialized

    // TODO: REPLACE THESE with your real values from your previous working code.
    // Example (from your project): https://ovkumzhdxjljukfqchvu.supabase.co and its anon key
    const SUPABASE_URL = window.SUPABASE_URL || "https://ovkumzhdxjljukfqchvu.supabase.co";
    const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92a3VtemhkeGpsanVrZnFjaHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0NTMwMjcsImV4cCI6MjA3NTAyOTAyN30.MOzQtbiP9Ac1QA1Tsk9A3bvu5wHUvv3ggUd8l-jSvcw";

    if (!window.supabase) {
      console.error("[common.js] Supabase SDK is missing. Include it in <head>:");
      console.error('<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
      return;
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes("YOUR-")) {
      console.error("[common.js] Supabase URL/Anon Key are not set. Please set them.");
      return;
    }

    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error("[common.js] Supabase init error:", e);
  }
})();

// ===== Tiny utils =====
window.qs = (key, defVal = null) => new URLSearchParams(location.search).get(key) ?? defVal;

// ===== Review card (uses mediaBox; image centers inside a square) =====
window.reviewCard = (r) => {
  const img = r.product_image_url || "https://placehold.co/128x128?text=No+Image";
  const url = `review.html?id=${r.id}`;
  return `
  <a class="card" href="${url}">
    <div class="mediaBox">
      <img src="${img}" alt="">
    </div>
    <div class="flex-1">
      <div class="meta">${r.genre}｜${new Date(r.created_at).toLocaleDateString()}</div>
      <div class="title u-break">${r.title}</div>
      <div class="meta u-break">${r.product_name} / ${r.author_name || "匿名"}</div>
    </div>
    <div class="text-2xl font-bold">${r.score}</div>
  </a>`;
};

// ===== Review card with stats (views/likes/comments inside the card) =====
window.reviewCardWithStats = (r, counts = {}) => {
  const views = counts.views ?? 0;
  const likes = counts.likes ?? 0;
  const comments = counts.comments ?? 0;
  const img = r.product_image_url || "https://placehold.co/128x128?text=No+Image";
  const url = `review.html?id=${r.id}`;
  return `
  <a class="card" href="${url}">
    <div class="mediaBox">
      <img src="${img}" alt="">
    </div>
    <div class="flex-1">
      <div class="meta">${r.genre}｜${new Date(r.created_at).toLocaleDateString()}</div>
      <div class="title u-break">${r.title}</div>
      <div class="meta u-break">${r.product_name} / ${r.author_name || "匿名"}</div>
      <div class="card-stats">
        <span>表示数: ${views}</span>
        <span>いいね: ${likes}</span>
        <span>コメント: ${comments}</span>
      </div>
    </div>
    <div class="text-2xl font-bold">${r.score}</div>
  </a>`;
};

// ===== Header: login/logout switch + admin link insertion =====
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const sb = window.sb;
    if (!sb) return;

    // login/logout
    const loginLink = document.getElementById("loginLink") || document.querySelector('header a[href*="auth"]');
    if (loginLink) {
      const { data: { user } = { user: null } } = await sb.auth.getUser();
      if (user) {
        loginLink.textContent = "ログアウト";
        loginLink.addEventListener("click", async (e) => {
          e.preventDefault();
          await sb.auth.signOut();
          location.reload();
        });
      } else {
        loginLink.textContent = "ログイン / 登録";
        loginLink.setAttribute("href", "auth.html");
      }
    }

    // admin link (insert between "My Page" and "Login")
    try {
      let isAdmin = false;
      if (sb.rpc) {
        const { data, error } = await sb.rpc("is_admin");
        if (!error) isAdmin = !!data;
      }
      if (isAdmin) {
        const nav = document.getElementById("navRight") || document.querySelector("header nav") || document.querySelector("header .mx");
        if (nav) {
          const loginEl = document.getElementById("loginLink") || nav.querySelector('a[href*="auth"]');
          const myEl = document.getElementById("myLink") || nav.querySelector('a[href*="my.html"]');

          let adminEl = nav.querySelector(".nav-admin");
          if (!adminEl) {
            adminEl = document.createElement("a");
            adminEl.href = "admin.html";
            adminEl.className = "btn btn-outline nav-admin";
            adminEl.textContent = "管理";
          }
          if (loginEl) nav.insertBefore(adminEl, loginEl);
          else if (myEl && myEl.parentNode) myEl.parentNode.insertBefore(adminEl, myEl.nextSibling);
          else nav.appendChild(adminEl);
        }
      }
    } catch (e) {
      console.warn("[common.js] is_admin RPC failed or not defined:", e?.message || e);
    }
  } catch (e) {
    console.error("[common.js] header init error:", e);
  }
});

// ===== Populate genre <select> from window.GENRES =====
window.populateGenreSelects = () => {
  const sels = [
    ...document.querySelectorAll("select#qGenre, select#rankGenre, select[data-genres]")
  ];
  sels.forEach((sel) => {
    const keepFirst = sel.options.length === 1 ? sel.options[0] : null;
    const current = sel.value;

    sel.innerHTML = "";

    if (keepFirst) {
      sel.appendChild(keepFirst);
    } else {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent =
        sel.id === "qGenre" ? "ジャンル：すべて" :
        sel.id === "rankGenre" ? "すべて" : "選択してください";
      sel.appendChild(opt);
    }

    window.GENRES.forEach((g) => {
      const o = document.createElement("option");
      o.value = g;
      o.textContent = g;
      sel.appendChild(o);
    });

    if (current && [...sel.options].some((o) => o.value === current)) {
      sel.value = current;
    }
  });
};

document.addEventListener("DOMContentLoaded", () => {
  try { window.populateGenreSelects(); } catch (e) { console.warn(e); }
});
// ===== modal helpers (中央表示) =====
window.openModal = (sel) => {
  const el = typeof sel === "string" ? document.querySelector(sel) : sel;
  if (!el) return;
  el.classList.add("is-open");
  el.classList.remove("hidden");
  el.setAttribute("aria-hidden", "false");
};
window.closeModal = (sel) => {
  const el = typeof sel === "string" ? document.querySelector(sel) : sel;
  if (!el) return;
  el.classList.remove("is-open");
  el.classList.add("hidden");
  el.setAttribute("aria-hidden", "true");
};

// クリックで閉じる（overlay / [data-close]）
document.addEventListener("click", (e) => {
  const overlay = e.target.closest(".modal .overlay");
  const closer  = e.target.closest("[data-close]");
  if (!overlay && !closer) return;

  const modal = e.target.closest(".modal") || document.querySelector(closer?.getAttribute("data-close"));
  if (modal) window.closeModal(modal);
});
