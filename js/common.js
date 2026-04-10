/**
 * common.js — 앱 전역: 카카오 설정 로드, 스토리지, 인증 유틸
 * 각 페이지 전용 스크립트보다 먼저 로드합니다.
 */

const CONFIG = {
  get KAKAO_APP_KEY() {
    const w = typeof window !== "undefined" && window.TODOC_SECRETS;
    return (w && typeof w.KAKAO_APP_KEY === "string" && w.KAKAO_APP_KEY) || "";
  },
};

async function ensureSecretsLoaded() {
  if (typeof window === "undefined") return;
  if (
    window.TODOC_SECRETS &&
    typeof window.TODOC_SECRETS.KAKAO_APP_KEY === "string" &&
    window.TODOC_SECRETS.KAKAO_APP_KEY
  ) {
    return;
  }
  try {
    const r = await fetch("/api/config", { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    window.TODOC_SECRETS = {
      ...(window.TODOC_SECRETS || {}),
      KAKAO_APP_KEY: typeof data.KAKAO_APP_KEY === "string" ? data.KAKAO_APP_KEY : "",
    };
  } catch {
    /* 로컬에서는 /api/config가 없을 수 있음 */
  }
}

const STORAGE_USERS = "todoc_users_v1";
const STORAGE_SESSION = "todoc_session_v1";

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function loadUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_USERS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("loadUsers 오류:", e);
  }
  return null;
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
}

function ensureUsersStorage() {
  if (!loadUsers()) saveUsers({});
}

function getSession() {
  return localStorage.getItem(STORAGE_SESSION);
}

function setSession(username) {
  if (username) localStorage.setItem(STORAGE_SESSION, username);
  else localStorage.removeItem(STORAGE_SESSION);
}

function getCurrentUser() {
  const u = getSession();
  if (!u) return null;
  const users = loadUsers();
  return users && users[u] ? { username: u, ...users[u] } : null;
}

function saveCurrentUserData(data) {
  const u = getSession();
  if (!u) return;
  const users = loadUsers() || {};
  users[u] = { ...users[u], ...data };
  saveUsers(users);
}

function handleLogin(username, password) {
  ensureUsersStorage();

  const users = loadUsers();

  if (!users || !users[username]) {
    alert("아이디 또는 비밀번호가 올바르지 않습니다.");
    return false;
  }

  if (users[username].password !== password) {
    alert("아이디 또는 비밀번호가 올바르지 않습니다.");
    return false;
  }

  setSession(username);
  return true;
}

function handleSignup(username, password) {
  ensureUsersStorage();

  const users = loadUsers() || {};

  if (users[username]) {
    alert("이미 사용 중인 아이디입니다.");
    return false;
  }

  users[username] = {
    password,
    isAdmin: false,
    displayName: `${username}님`,
    phone: "",
    pets: [],
    reservations: [],
  };

  saveUsers(users);
  setSession(username);
  alert("회원가입이 완료되었습니다.");
  return true;
}

function logout() {
  setSession(null);
  window.location.href = "index.html";
}
