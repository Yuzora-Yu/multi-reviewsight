// js/auth.js — トースト表示＆自動遷移つき

document.addEventListener('DOMContentLoaded', () => {
  init().catch(console.error);
});

async function init() {
  const sb = window.sb;
  const stateEl = document.getElementById('authState');
  const logoutBtn = document.getElementById('logoutBtn');

  // 状態表示
  await refreshState();

  // ログアウト
  logoutBtn?.addEventListener('click', async () => {
    await sb.auth.signOut();
    toast('ログアウトしました');
    await refreshState();
  });

  // ログインフォーム
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPass').value;
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    toggleBtn(btn, true, '処理中…');

    try {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      close('#modalLogin');
      toast('ログインしました');
      setTimeout(() => location.href = 'my.html', 900);
    } catch (err) {
      alert('ログインに失敗しました: ' + (err?.message || err));
    } finally {
      toggleBtn(btn, false);
      await refreshState();
    }
  });

  // 新規（仮登録）
  document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('regEmail').value.trim();
    const p1 = document.getElementById('regPass').value;
    const p2 = document.getElementById('regPass2').value;
    if (p1 !== p2) return alert('パスワードが一致しません');

    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    toggleBtn(btn, true, '送信中…');
    try {
      const { error } = await sb.auth.signUp({
        email,
        password: p1,
        options: { emailRedirectTo: location.href }
      });
      if (error) throw error;
      close('#modalRegister');
      toast('確認メールを送信しました');
    } catch (err) {
      alert('登録に失敗しました: ' + (err?.message || err));
    } finally {
      toggleBtn(btn, false);
      await refreshState();
    }
  });

  // セッション変化で状態更新
  sb.auth.onAuthStateChange((_e, _session) => {
    refreshState();
  });

  async function refreshState() {
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      stateEl.textContent = user.email + ' としてログイン中';
      logoutBtn?.classList.remove('hidden');
    } else {
      stateEl.textContent = '未ログイン';
      logoutBtn?.classList.add('hidden');
    }
  }
}

// helpers
function toast(msg) {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add('show'); }, 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2000);
}
function close(sel){ window.closeModal(sel); }
function toggleBtn(btn, busy, altText){
  if (!btn) return;
  if (busy){ btn.dataset._t = btn.textContent; btn.disabled = true; if(altText) btn.textContent = altText; }
  else { btn.disabled = false; btn.textContent = btn.dataset._t || btn.textContent; }
}
