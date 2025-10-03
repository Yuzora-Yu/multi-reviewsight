// js/auth.js —— フル置換

document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.sb;

  // ====== 小さなモーダルユーティリティ ======
  const openModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
  };
  const closeModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
  };
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  // 背景クリックで閉じる
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
  });

  // ====== 初期状態の表示 ======
  const stateEl = document.getElementById('authState');
  const logoutBtn = document.getElementById('logoutBtn');

  async function refreshState() {
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      stateEl.textContent = `ログイン中：${user.email}`;
      logoutBtn.classList.remove('hidden');
    } else {
      stateEl.textContent = '未ログイン';
      logoutBtn.classList.add('hidden');
    }
  }

  await refreshState();

  // ====== 1) ログイン ======
  document.getElementById('openLogin')?.addEventListener('click', () => openModal('modalLogin'));

  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPass').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { window.toast('ログイン失敗：' + error.message); return; }
    window.toast('ログインしました');
    closeModal('modalLogin');
    await refreshState();
  });

  // ====== 2) 新規登録（仮登録 → メール） ======
  document.getElementById('openRegister')?.addEventListener('click', () => openModal('modalRegister'));

  document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('regEmail').value.trim();
    const pass1 = document.getElementById('regPass').value;
    const pass2 = document.getElementById('regPass2').value;
    if (pass1 !== pass2) { window.toast('確認用パスワードが一致しません'); return; }

    // ここが重要：確認リンクの戻り先
    const redirectTo = new URL('auth.html?confirm=1', window.APP_BASE_ABS).toString();

    const { error } = await sb.auth.signUp({
      email,
      password: pass1,
      options: {
        emailRedirectTo: redirectTo,
        // 日本語メールにしたい場合：Auth > Templates 側で本文を日本語化してください
        data: { locale: 'ja' }
      }
    });
    if (error) { window.toast('登録失敗：' + error.message); return; }

    window.toast('確認メールを送信しました。受信トレイをご確認ください。');
    closeModal('modalRegister');
  });

  // ====== 3) 確認リンクからの復帰（本登録：レビュアーネーム） ======
  // 既にログイン済みで profiles.display_name が未設定なら、ネーム設定モーダルを出す
  async function maybeShowNameModal() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // すでに display_name があればスキップ
    const { data } = await sb.from('profiles')
      .select('display_name').eq('user_id', user.id).maybeSingle();
    if (data?.display_name) return;

    // メール表示
    const mail = user.email ?? '';
    document.getElementById('nameEmail').textContent = mail;

    // オープン
    openModal('modalName');
  }

  // `?confirm=1` で戻ってきたら（またはリンクで既にサインイン済みなら）名前モーダル
  const url = new URL(location.href);
  if (url.searchParams.get('confirm') === '1') {
    // 少し待ってからユーザー取得（セッション反映のため）
    setTimeout(async () => { await refreshState(); await maybeShowNameModal(); }, 300);
  } else {
    // 直接開いた場合でも、未設定なら促す
    setTimeout(async () => { await maybeShowNameModal(); }, 300);
  }

  // ネーム保存
  document.getElementById('nameForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.toast('ログインが必要です'); return; }
    const displayName = document.getElementById('displayName').value.trim();
    if (!displayName) return;

    const { error } = await sb.from('profiles')
      .upsert({ user_id: user.id, display_name: displayName }, { onConflict: 'user_id' });
    if (error) { window.toast('保存に失敗しました'); console.error(error); return; }

    window.toast('本登録が完了しました！');
    closeModal('modalName');
    await refreshState();
  });

  // ====== 4) ログアウト ======
  logoutBtn?.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.toast('ログアウトしました');
    await refreshState();
  });
});
