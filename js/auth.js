// js/auth.js — 成功/失敗の表示を厳密化、右下トースト＆自動遷移

document.addEventListener('DOMContentLoaded', () => {
  init().catch(console.error);
});

async function init() {
  const sb = window.sb;
  const stateEl = document.getElementById('authState');
  const logoutBtn = document.getElementById('logoutBtn');

  await refreshState();
  logoutBtn?.addEventListener('click', async () => {
    await sb.auth.signOut();
    toast('ログアウトしました');
    await refreshState();
  });

  // ---- ログイン ----
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPass').value;
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    toggleBtn(btn, true, '処理中…');

    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      // 成功判定は data.session / data.user の存在で
      if (!data?.session || !data?.user) throw new Error('セッションが確立できませんでした');
      window.closeModal('#modalLogin');
      toast('ログインしました');
      setTimeout(() => location.href = 'my.html', 900);
    } catch (err) {
      alert('ログインに失敗しました: ' + (err?.message || err));
    } finally {
      toggleBtn(btn, false);
      await refreshState();
    }
  });

  // ---- 新規（仮登録） ----
  document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('regEmail').value.trim();
    const p1 = document.getElementById('regPass').value;
    const p2 = document.getElementById('regPass2').value;
    if (p1 !== p2) return alert('パスワードが一致しません');
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    toggleBtn(btn, true, '送信中…');
    try {
      const { error } = await sb.auth.signUp({ email, password: p1, options: { emailRedirectTo: location.href } });
      if (error) throw error;
      window.closeModal('#modalRegister');
      toast('確認メールを送信しました');
    } catch (err) {
      alert('登録に失敗しました: ' + (err?.message || err));
    } finally {
      toggleBtn(btn, false);
      await refreshState();
    }
  });

  sb.auth.onAuthStateChange(() => refreshState());

  async function refreshState() {
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      stateEl.textContent = (user.email || '') + ' としてログイン中';
      logoutBtn?.classList.remove('hidden');
    } else {
      stateEl.textContent = '未ログイン';
      logoutBtn?.classList.add('hidden');
    }
  }
}

// ===== helpers =====
function toast(msg) {
  const wrap = document.getElementById('toastWrap') || (() => {
    const w = document.createElement('div'); w.id='toastWrap'; w.className='toast-wrap'; document.body.appendChild(w); return w;
  })();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2000);
}
function toggleBtn(btn, busy, altText){
  if (!btn) return;
  if (busy){ btn.dataset._t = btn.textContent; btn.disabled = true; if(altText) btn.textContent = altText; }
  else { btn.disabled = false; btn.textContent = btn.dataset._t || btn.textContent; }
}
