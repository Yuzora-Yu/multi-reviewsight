// js/auth.js  — サインアップ → 確認メール → 本登録（profiles）/ ログイン
document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.sb;
  const BASE = window.APP_BASE_ABS; // 例: https://yuzora-yu.github.io/multi-reviewsight/

  // 画面要素
  const stateEl = document.getElementById('authState');
  const modal = document.getElementById('authModal');
  const titleEl = document.getElementById('modalTitle');
  const signupForm = document.getElementById('signupForm');
  const loginForm  = document.getElementById('loginForm');
  const openSignup = document.getElementById('openSignup');
  const openLogin  = document.getElementById('openLogin');
  const closeModal = document.getElementById('closeModal');
  const logoutBtn  = document.getElementById('logoutBtn');

  const completeSection = document.getElementById('completeSection');
  const completeEmail   = document.getElementById('completeEmail');
  const completeName    = document.getElementById('completeName');
  const completeForm    = document.getElementById('completeForm');

  // モーダルヘルパ
  const openModal = (mode) => {
    titleEl.textContent = (mode === 'login') ? 'ログイン' : '新規会員登録';
    signupForm.classList.toggle('hidden', mode === 'login');
    loginForm.classList.toggle('hidden', mode !== 'login');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  };
  const close = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };

  openSignup.addEventListener('click', () => openModal('signup'));
  openLogin.addEventListener('click',  () => openModal('login'));
  closeModal.addEventListener('click', close);

  // 現在のログイン状態表示
  async function refreshState() {
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      stateEl.innerHTML = `現在：<strong>ログイン中</strong>（${user.email}）`;
      logoutBtn.classList.remove('hidden');
    } else {
      stateEl.textContent = '現在：未ログイン';
      logoutBtn.classList.add('hidden');
    }
  }
  logoutBtn.addEventListener('click', async () => {
    await sb.auth.signOut();
    await refreshState();
    alert('ログアウトしました');
  });

  // ========== 1) 新規会員登録（仮登録メール送信） ==========
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = /** @type {HTMLInputElement} */(document.getElementById('suEmail')).value.trim();
    const pw1   = /** @type {HTMLInputElement} */(document.getElementById('suPassword')).value;
    const pw2   = /** @type {HTMLInputElement} */(document.getElementById('suPassword2')).value;
    if (pw1 !== pw2) return alert('確認用パスワードが一致しません');
    if (pw1.length < 8) return alert('パスワードは8文字以上で入力してください');

    // クリック1回ガード
    const btn = /** @type {HTMLButtonElement} */(document.getElementById('signupBtn'));
    btn.disabled = true;

    // メール内リンクの遷移先（auth.html に戻し、signup=1 を付けて本登録画面へ）
    const redirectTo = new URL('auth.html', BASE);
    redirectTo.searchParams.set('signup', '1');

    const { error } = await sb.auth.signUp({
      email,
      password: pw1,
      options: { emailRedirectTo: redirectTo.toString() }
    });

    btn.disabled = false;
    if (error) return alert('仮登録に失敗しました：' + error.message);

    alert('確認メールを送信しました。メール内のリンクから本登録に進んでください。');
    close();
  });

  // ========== 2) ログイン ==========
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = /** @type {HTMLInputElement} */(document.getElementById('liEmail')).value.trim();
    const password = /** @type {HTMLInputElement} */(document.getElementById('liPassword')).value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return alert('ログインに失敗しました：' + error.message);
    close();
    await refreshState();
    alert('ログインしました');
  });

  // ========== 3) メールリンクで戻ってきたときの「本登録」 ==========
  // 仕組み：
  //   サインアップ確認リンク → auth.html?signup=1#access_token=...&refresh_token=...
  //   上記ハッシュからセッションをセットし、profiles に reviewer_name を保存する。
  async function bootstrapFromEmailLink() {
    const url = new URL(location.href);
    const signupParam = url.searchParams.get('signup');

    // 1) ハッシュに access_token/refresh_token があればセッションをセット
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const access_token  = hash.get('access_token');
    const refresh_token = hash.get('refresh_token');
    if (access_token && refresh_token) {
      await sb.auth.setSession({ access_token, refresh_token });
      // ハッシュは見せないよう消しておく
      history.replaceState(null, '', url.pathname + url.search);
    }

    // 2) サインアップ確認後（?signup=1）なら本登録UIを出す
    if (signupParam === '1') {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return; // 認証失敗時は何もしない
      completeSection.classList.remove('hidden');
      completeEmail.value = user.email || '';
    }
  }

  // 本登録フォーム（profiles に保存）
  completeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return alert('認証情報を取得できませんでした。');

    const name = completeName.value.trim();
    if (!name) return alert('レビュアーネームを入力してください');

    // profiles を upsert（既にあれば更新）
    const { error } = await sb.from('profiles')
      .upsert({ user_id: user.id, reviewer_name: name }, { onConflict: 'user_id' });
    if (error) return alert('本登録に失敗しました：' + error.message);

    alert('本登録が完了しました！トップへ移動します。');
    location.href = BASE;
  });

  await bootstrapFromEmailLink();
  await refreshState();
});
