/**
 * index.js — 홈(로그인) 페이지 번들
 * config + storage + auth + reservations + home + 초기화
 */
/**
 * config.js — 앱 전역 설정값, 상수, 목업 데이터, 전역 상태 변수
 *
 * 이 파일은 가장 먼저 로드되어야 합니다.
 * 다른 모든 JS 파일이 여기서 선언한 변수를 참조합니다.
 */

/* =============================================================================
 * [설정] 카카오맵 API 키
 * - 배포(Vercel): Environment Variables의 KAKAO_APP_KEY를 /api/config로 주입받아 사용합니다.
 * - 로컬 개발: 필요하면 window.TODOC_SECRETS = { KAKAO_APP_KEY: \"...\" } 형태로 직접 주입할 수 있습니다.
 * ============================================================================= */
const CONFIG = {
  get KAKAO_APP_KEY() {
    const w = typeof window !== "undefined" && window.TODOC_SECRETS;
    return (w && typeof w.KAKAO_APP_KEY === "string" && w.KAKAO_APP_KEY) || "";
  },
};

/* =============================================================================
 * [상수] 로컬 스토리지 키
 * 버전 접미사(_v1)를 붙여 데이터 구조 변경 시 쉽게 마이그레이션할 수 있게 합니다.
 * ============================================================================= */
const STORAGE_USERS   = "todoc_users_v1";   // 전체 사용자 DB (객체 배열)
const STORAGE_SESSION = "todoc_session_v1"; // 현재 로그인한 사용자 아이디 (문자열)

/* =============================================================================
 * [상수] 목업 동물병원 데이터
 * 카카오 API 키가 없거나 검색 실패 시 이 데이터를 대신 표시합니다.
 * tags 배열: 필터 칩(all·24h·emergency·weekend·open)과 매핑됩니다.
 * x: 경도(longitude), y: 위도(latitude) — 카카오맵 좌표 형식
 * ============================================================================= */
/* =============================================================================
 * [전역 상태] 카카오맵 관련 변수
 * 여러 파일에서 공유하므로 전역 스코프에 선언합니다.
 * ============================================================================= */

/** @type {kakao.maps.Map | null} 카카오맵 인스턴스 (초기화 전에는 null) */
let kakaoMap = null;

/** @type {kakao.maps.Marker[]} 지도에 표시된 마커 배열 (clearMarkers 시 제거) */
let mapMarkers = [];

/** 카카오 장소 검색 서비스 인스턴스 (keywordSearch에 사용) */
let placesService = null;

/** 지도가 이미 초기화되었는지 여부 (중복 초기화 방지) */
let mapInitialized = false;

/** 현재 활성화된 병원 필터 칩 값 ("all" | "24h" | "emergency" | "weekend" | "open") */
let activeFilter = "all";

/* =============================================================================
 * [유틸] HTML 이스케이프
 * 사용자 입력값을 DOM에 삽입할 때 XSS 공격을 방지합니다.
 * 예: <script>alert(1)</script> → &lt;script&gt;...
 * ============================================================================= */
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;   // textContent는 자동으로 HTML 특수문자를 이스케이프합니다.
  return d.innerHTML;  // 이스케이프된 문자열을 innerHTML로 반환합니다.
}

/* =============================================================================
 * [유틸] 고유 ID 생성
 * 반려동물·예약 데이터에 고유 식별자를 부여할 때 사용합니다.
 * Date.now(): 밀리초 타임스탬프 (충돌 가능성 줄임)
 * Math.random().toString(36): 36진수 랜덤 문자열 (추가 고유성)
 * ============================================================================= */
function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* =============================================================================
 * [유틸] 디바운스
 * 연속된 이벤트(예: 검색창 입력)에서 마지막 호출 후 ms만큼 대기한 뒤 실행합니다.
 * 검색 API 호출 횟수를 줄여 성능과 비용을 절감합니다.
 * ============================================================================= */
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);               // 이전 타이머 취소
    timer = setTimeout(() => fn.apply(this, args), ms); // 새 타이머 등록
  };
}
/**
 * storage.js — 로컬 스토리지 기반 사용자 DB 관리
 *
 * 데모 앱이므로 서버 없이 브라우저의 localStorage에 모든 데이터를 저장합니다.
 * 실제 서비스에서는 이 계층을 API 호출로 교체해야 합니다.
 *
 * 데이터 구조 (STORAGE_USERS):
 * {
 *   "username": {
 *     password: string,       // ⚠️ 데모용 평문 저장 (실제 서비스에서는 해싱 필요)
 *     isAdmin: boolean,       // 관리자 여부
 *     displayName: string,    // 화면에 표시되는 이름
 *     email: string,
 *     pets: Pet[],            // 반려동물 목록
 *     reservations: Reservation[] // 예약 목록
 *   }
 * }
 *
 * 의존: config.js (STORAGE_USERS, STORAGE_SESSION)
 */

/* =============================================================================
 * [스토리지] 사용자 DB 읽기/쓰기
 * ============================================================================= */

/**
 * localStorage에서 전체 사용자 객체를 불러옵니다.
 * JSON 파싱 실패(데이터 손상 등) 시 null을 반환하고 콘솔에 경고를 출력합니다.
 * @returns {Object|null} 사용자 맵 객체 또는 null
 */
function loadUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_USERS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("loadUsers 오류:", e);
  }
  return null;
}

/**
 * 사용자 객체를 JSON 직렬화해 localStorage에 저장합니다.
 * @param {Object} users - 전체 사용자 맵 객체
 */
function saveUsers(users) {
  localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
}

/* =============================================================================
 * [초기화] 사용자 저장소가 없으면 빈 객체로 초기화합니다.
 * ============================================================================= */
function ensureUsersStorage() {
  if (!loadUsers()) saveUsers({});
}

/* =============================================================================
 * [세션] 로그인 상태 관리
 * 로그인한 사용자의 username을 sessionStorage 대신 localStorage에 저장합니다.
 * (탭 닫아도 로그인 상태 유지 — 브라우저 재시작까지)
 * ============================================================================= */

/**
 * 현재 세션(로그인한 사용자 아이디)을 반환합니다.
 * @returns {string|null}
 */
function getSession() {
  return localStorage.getItem(STORAGE_SESSION);
}

/**
 * 세션을 설정하거나 제거합니다.
 * @param {string|null} username - null 전달 시 로그아웃(세션 삭제)
 */
function setSession(username) {
  if (username) localStorage.setItem(STORAGE_SESSION, username);
  else localStorage.removeItem(STORAGE_SESSION);
}

/* =============================================================================
 * [현재 사용자] 세션 기반 사용자 데이터 조회/갱신
 * ============================================================================= */

/**
 * 현재 로그인한 사용자의 전체 데이터를 반환합니다.
 * 세션이 없거나 사용자 데이터가 없으면 null을 반환합니다.
 * username 필드를 추가로 붙여서 반환합니다.
 * @returns {{ username: string, password: string, isAdmin: boolean, pets: Array, reservations: Array, ... }|null}
 */
function getCurrentUser() {
  const u = getSession();
  if (!u) return null;
  const users = loadUsers();
  return users && users[u] ? { username: u, ...users[u] } : null;
}

/**
 * 현재 로그인한 사용자의 데이터 일부를 갱신합니다.
 * 기존 데이터에 data 객체를 스프레드로 병합합니다.
 * 예: saveCurrentUserData({ pets: [...] }) → pets만 업데이트
 * @param {Object} data - 갱신할 필드들
 */
function saveCurrentUserData(data) {
  const u = getSession();
  if (!u) return;
  const users = loadUsers() || {};
  users[u] = { ...users[u], ...data }; // 얕은 병합(shallow merge)
  saveUsers(users);
}
/**
 * auth.js — 인증 기능 (로그인 / 회원가입 / 로그아웃)
 *
 * 의존: config.js, storage.js
 *
 * 실제 서비스라면 이 파일의 함수들이 서버 API를 호출해야 합니다.
 * 현재는 데모용으로 localStorage에 평문 비밀번호를 저장합니다.
 */

/* =============================================================================
 * [기능] 로그인
 * 입력한 아이디/비밀번호를 localStorage의 사용자 DB와 비교합니다.
 * 성공 시 세션을 설정하고 true를 반환, 실패 시 alert 후 false를 반환합니다.
 * ============================================================================= */

/**
 * @param {string} username - 입력된 아이디
 * @param {string} password - 입력된 비밀번호 (평문)
 * @returns {boolean} 로그인 성공 여부
 */
function handleLogin(username, password) {
  ensureUsersStorage();

  const users = loadUsers();

  // 아이디가 존재하지 않는 경우
  if (!users || !users[username]) {
    alert("아이디 또는 비밀번호가 올바르지 않습니다.");
    return false;
  }

  // 비밀번호가 일치하지 않는 경우 (보안상 아이디/비밀번호 오류를 동일 메시지로 처리)
  if (users[username].password !== password) {
    alert("아이디 또는 비밀번호가 올바르지 않습니다.");
    return false;
  }

  setSession(username); // 로그인 성공: 세션 저장
  return true;
}

/* =============================================================================
 * [기능] 회원가입
 * 새 계정을 사용자 DB에 추가하고 자동으로 로그인 처리합니다.
 * ============================================================================= */

/**
 * @param {string} username - 사용할 아이디 (중복 불가)
 * @param {string} password - 사용할 비밀번호 (최소 4자, HTML 검증)
 * @returns {boolean} 회원가입 성공 여부
 */
function handleSignup(username, password) {
  ensureUsersStorage();

  const users = loadUsers() || {};

  // 아이디 중복 검사
  if (users[username]) {
    alert("이미 사용 중인 아이디입니다.");
    return false;
  }

  users[username] = {
    password,
    isAdmin: false,
    displayName: `${username}님`,
    email: `${username}@example.com`,
    phone: "",
    pets: [],
    reservations: [],
  };

  saveUsers(users);
  setSession(username); // 가입 즉시 로그인 처리
  alert("회원가입이 완료되었습니다.");
  return true;
}

/* =============================================================================
 * [기능] 로그아웃
 * 세션을 삭제하고 로그인 화면으로 전환합니다.
 * ============================================================================= */
function logout() {
  setSession(null); // 세션 삭제

  // MPA 방식: 로그인 페이지(index.html)로 이동합니다.
  window.location.href = "index.html";
}
/**
 * reservations.js — 예약 관련 데이터 처리 및 예약내역 페이지 렌더링
 *
 * 의존: config.js (escapeHtml), storage.js (getCurrentUser, saveCurrentUserData)
 *
 * 담당 기능:
 *   - 예약을 "예정" / "지난" 으로 분류
 *   - D-day 계산 및 뱃지 생성
 *   - 예약 데이터 저장
 *   - 예약내역 페이지 카드 렌더링
 */

/* =============================================================================
 * [기능] 예약 분류 — 예정된 예약 / 지난 예약
 * 현재 시각을 기준으로 미래 예약(upcoming)과 과거 예약(past)으로 나눕니다.
 * upcoming: 가까운 순 정렬 / past: 최근 순 정렬
 * ============================================================================= */

/**
 * @param {Array} reservations - 전체 예약 배열
 * @returns {{ upcoming: Array, past: Array }}
 */
function splitReservationsByTime(reservations) {
  const now = new Date();
  const upcoming = [];
  const past = [];

  (reservations || []).forEach((r) => {
    const dt = new Date(r.datetime);
    if (dt >= now) upcoming.push(r);
    else past.push(r);
  });

  // 예정 예약: 날짜 오름차순 (가장 가까운 예약 먼저)
  upcoming.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  // 지난 예약: 날짜 내림차순 (가장 최근 예약 먼저)
  past.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

  return { upcoming, past };
}

/* =============================================================================
 * [기능] D-day 뱃지 생성
 * 예약 날짜와 오늘을 비교해 D-Day / D-N / 종료 텍스트와 CSS 클래스를 반환합니다.
 * 시간은 무시하고 날짜(date)만 비교합니다.
 * ============================================================================= */

/**
 * @param {string} isoDatetime - "2026-04-07T11:33" 형식의 날짜 문자열
 * @returns {{ text: string, className: string }}
 */
function ddayBadge(isoDatetime) {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // 오늘 자정으로 설정 (시간 제거)

  const target = new Date(isoDatetime);
  target.setHours(0, 0, 0, 0); // 예약일 자정으로 설정

  // 밀리초 → 일수 변환
  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));

  if (diff === 0)
    return { text: "D-Day", className: "res-card__badge res-card__badge--dday" };
  if (diff > 0)
    return { text: `D-${diff}`, className: "res-card__badge res-card__badge--d7" };

  // 이미 지난 예약
  return { text: "종료", className: "res-card__badge res-card__badge--d7" };
}

/**
 * home.js — 홈 페이지 렌더링 및 날짜 포매팅 유틸
 *
 * 의존: config.js (escapeHtml),
 *       storage.js (getCurrentUser),
 *       reservations.js (splitReservationsByTime, ddayBadge)
 *
 * 담당 기능:
 *   - 홈 화면의 "다가오는 예약 카드" 렌더링
 *   - 홈 화면의 "이전 예약 미니 카드" 렌더링
 *   - 날짜/D-day 포매팅 유틸 함수
 */

/* =============================================================================
 * [UI] 홈 페이지 렌더링
 * 로그인한 사용자의 예약 데이터를 읽어 홈 화면을 갱신합니다.
 * navigateTo("home") 및 로그인 직후 showMainApp()에서 호출됩니다.
 * ============================================================================= */
function renderHome() {
  const user = getCurrentUser();
  if (!user) return;

  const { upcoming, past } = splitReservationsByTime(user.reservations || []);

  /* ─── 다가오는 예약 카드 ──────────────────────────────────────
     예정된 예약 중 가장 가까운 것 하나를 강조 카드로 표시합니다.
     예약이 없으면 "예정된 예약이 없습니다." 메시지를 표시합니다. */
  const upcomingWrap = document.getElementById("home-upcoming-wrap");

  if (upcoming.length) {
    const u = upcoming[0]; // 가장 가까운 예약
    const daysLeft = daysUntilAppointment(u.datetime);

    upcomingWrap.innerHTML = `
      <div class="upcoming-card upcoming-card--clickable" role="button" tabindex="0" title="예약내역으로 이동">
        <div class="upcoming-card__icon">📅</div>
        <div class="upcoming-card__meta">
          <h3>${escapeHtml(u.hospitalName)}</h3>
          <span>${formatShortDate(u.datetime)}</span>
        </div>
        <div class="dday-badge">
          <span class="dday-badge__label">D-Day</span>
          <span class="dday-badge__num">${daysLeft}</span>
        </div>
      </div>`;
    const cardEl = upcomingWrap.querySelector(".upcoming-card--clickable");
    if (cardEl) {
      const go = () => {
        window.location.href = "book.html?tab=upcoming";
      };
      cardEl.addEventListener("click", go);
      cardEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });
    }
  } else {
    upcomingWrap.innerHTML = `
      <p class="empty-state" style="padding:20px">예정된 예약이 없습니다.</p>`;
  }

  /* ─── 이전 예약 미니 카드 ─────────────────────────────────────
     지난 예약 중 가장 최근 것 하나를 간략히 표시합니다.
     지난 예약도 없으면 안내 메시지를 표시합니다. */
  const prev = past.slice(0, 1); // 가장 최근 지난 예약 1개
  const homePrev = document.getElementById("home-prev-list");

  if (prev.length) {
    const p = prev[0];
    homePrev.innerHTML = `
      <div class="mini-res-card">
        <div class="mini-res-card__icon">+</div>
        <div>
          <h4>${escapeHtml(p.hospitalName)}</h4>
          <div class="type">${escapeHtml(p.reason || "")}</div>
          <div class="date">${p.datetime.slice(0, 10)}</div>
        </div>
      </div>`;
  } else if (upcoming.length === 0) {
    // 예정·지난 예약 모두 없는 경우
    homePrev.innerHTML = `
      <div class="empty-state">예약 내역이 없습니다. 병원검색에서 예약해 보세요.</div>`;
  } else {
    // 예정 예약은 있지만 지난 예약이 없는 경우
    homePrev.innerHTML = `<div class="empty-state">이전 예약이 없습니다.</div>`;
  }
}

/* =============================================================================
 * [유틸] 날짜 포매팅
 * ============================================================================= */

/**
 * 예약일(자정 기준)까지 남은 일수. 오늘이면 0, 이미 지났으면 0.
 */
function daysUntilAppointment(iso) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const n = Math.round((target - today) / (1000 * 60 * 60 * 24));
  return n < 0 ? 0 : n;
}

/**
 * 날짜를 한국식 짧은 형식으로 변환합니다.
 * 예: "26.04.07 (화) 11:33"
 * @param {string} iso
 * @returns {string}
 */
function formatShortDate(iso) {
  const d = new Date(iso);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  const yy  = String(d.getFullYear()).slice(2);          // 연도 두 자리
  const mm  = String(d.getMonth() + 1).padStart(2, "0"); // 월 두 자리
  const dd  = String(d.getDate()).padStart(2, "0");       // 일 두 자리
  const day = weekdays[d.getDay()];                       // 요일 한글
  const hh  = String(d.getHours()).padStart(2, "0");      // 시 두 자리
  const min = String(d.getMinutes()).padStart(2, "0");    // 분 두 자리

  return `${yy}.${mm}.${dd} (${day}) ${hh}:${min}`;
}
/* =============================================================================
 * index.html — 페이지 초기화 (인라인 스크립트 통합)
 * ============================================================================= */
(function bootIndex() {
  ensureUsersStorage();

  if (getSession() && getCurrentUser()) {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");
    renderHome();
    initHomeMapOnce();
  }
})();

document.getElementById("form-login").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("login-id").value.trim();
  const pw = document.getElementById("login-pw").value;

  if (handleLogin(id, pw)) {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");
    renderHome();
    initHomeMapOnce();
  }
});

document.getElementById("form-signup").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("signup-id").value.trim();
  const pw = document.getElementById("signup-pw").value;

  if (handleSignup(id, pw)) {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");
    renderHome();
    initHomeMapOnce();
  }
});

document.getElementById("btn-go-signup").addEventListener("click", () => {
  document.getElementById("login-panel").classList.add("hidden");
  document.getElementById("signup-panel").classList.remove("hidden");
});

document.getElementById("btn-back-login").addEventListener("click", () => {
  document.getElementById("signup-panel").classList.add("hidden");
  document.getElementById("login-panel").classList.remove("hidden");
});

document.getElementById("btn-goto-search").addEventListener("click", () => {
  window.location.href = "search.html";
});

document.getElementById("btn-dummy-noti").addEventListener("click", () => {
  alert("알림이 없습니다.");
});

function readyMessage(serviceName) {
  alert(`${serviceName} 서비스는 준비 중입니다.`);
}

/* =============================================================================
 * [홈 지도] 카카오맵 미리보기 (동물병원만)
 * - 배포에서는 /api/config에서 키를 주입받습니다.
 * ============================================================================= */
let homeMapInitialized = false;
let homeMap = null;
let homePlaces = null;
let homeMarkers = [];
let homeInfoWindow = null;
let homeMapResizeBound = false;

const TODOC_GEO_KEY = "todoc_geo_v1";

function readGeoCache() {
  try {
    const raw = sessionStorage.getItem(TODOC_GEO_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (typeof o.lat === "number" && typeof o.lng === "number") return o;
  } catch {
    /* ignore */
  }
  return null;
}

function writeGeoCache(coords) {
  try {
    sessionStorage.setItem(TODOC_GEO_KEY, JSON.stringify(coords));
  } catch {
    /* ignore */
  }
}

async function ensureSecretsLoaded() {
  if (typeof window === "undefined") return;
  if (window.TODOC_SECRETS && typeof window.TODOC_SECRETS.KAKAO_APP_KEY === "string" && window.TODOC_SECRETS.KAKAO_APP_KEY) {
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
    // 로컬에서는 /api/config가 없을 수 있음
  }
}

function hasKakaoKey() {
  return typeof CONFIG.KAKAO_APP_KEY === "string" && CONFIG.KAKAO_APP_KEY.length > 10;
}

function loadKakaoScript() {
  return new Promise((resolve, reject) => {
    if (typeof kakao !== "undefined" && kakao.maps) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${CONFIG.KAKAO_APP_KEY}&libraries=services&autoload=false`;
    s.onload = () => {
      if (typeof kakao !== "undefined") kakao.maps.load(resolve);
      else reject(new Error("kakao"));
    };
    s.onerror = () => reject(new Error("load fail"));
    document.head.appendChild(s);
  });
}

function showHomeMapFallback(message) {
  const fb = document.getElementById("home-map-fallback");
  const c = document.getElementById("home-map-container");
  if (fb) {
    fb.textContent = message;
    fb.classList.remove("hidden");
  }
  if (c) c.classList.add("hidden");
}

function hideHomeMapFallback() {
  const fb = document.getElementById("home-map-fallback");
  const c = document.getElementById("home-map-container");
  if (fb) fb.classList.add("hidden");
  if (c) c.classList.remove("hidden");
}

function clearHomeMarkers() {
  homeMarkers.forEach((m) => m.setMap(null));
  homeMarkers = [];
  if (homeInfoWindow) {
    homeInfoWindow.close();
    homeInfoWindow = null;
  }
}

/**
 * 위치 좌표. 홈에서는 항상 브라우저에 요청(권한 안내). 검색 페이지는 sessionStorage 캐시를 먼저 씁니다.
 */
function getUserCoordsOrDefault(options = {}) {
  const preferSessionCache = options.preferSessionCache === true;
  const forceFresh = options.forceFresh === true;
  if (preferSessionCache && !forceFresh) {
    const c = readGeoCache();
    if (c) return Promise.resolve({ lat: c.lat, lng: c.lng });
  }
  return new Promise((resolve) => {
    const fallback = readGeoCache() || { lat: 37.5665, lng: 126.978 };
    if (!navigator.geolocation) {
      resolve(fallback);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const o = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        writeGeoCache(o);
        resolve(o);
      },
      () => resolve(readGeoCache() || fallback),
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: forceFresh ? 0 : 60000,
      }
    );
  });
}

function homeMapKakaoPlaceToHospital(p, i) {
  return {
    id: p.id || `kakao-${i}`,
    place_name: p.place_name,
    address_name: p.address_name,
    road_address_name: p.road_address_name,
    phone: p.phone,
    x: p.x,
    y: p.y,
  };
}

function homeInfoWindowHtml(h) {
  const addr = h.road_address_name || h.address_name || "—";
  const phone = h.phone || "—";
  return (
    `<div class="map-info-window">` +
    `<strong>${escapeHtml(h.place_name || "")}</strong>` +
    `<p>${escapeHtml(addr)}</p>` +
    `<p>${escapeHtml(phone)}</p>` +
    `</div>`
  );
}

function bindHomeMapResize() {
  if (homeMapResizeBound) return;
  homeMapResizeBound = true;
  window.addEventListener("resize", () => {
    if (homeMap) homeMap.relayout();
  });
}

function relayoutHomeMapSoon() {
  requestAnimationFrame(() => {
    if (homeMap) homeMap.relayout();
  });
  setTimeout(() => {
    if (homeMap) homeMap.relayout();
  }, 250);
}

function applyHomeKeywordResults(data, st) {
  if (st !== kakao.maps.services.Status.OK || !data.length) {
    clearHomeMarkers();
    return;
  }
  clearHomeMarkers();
  const bounds = new kakao.maps.LatLngBounds();
  data.slice(0, 10).forEach((p, i) => {
    const h = homeMapKakaoPlaceToHospital(p, i);
    const pos = new kakao.maps.LatLng(parseFloat(h.y), parseFloat(h.x));
    bounds.extend(pos);
    const m = new kakao.maps.Marker({ map: homeMap, position: pos });
    homeMarkers.push(m);
    kakao.maps.event.addListener(m, "click", () => {
      if (!homeInfoWindow) {
        homeInfoWindow = new kakao.maps.InfoWindow({ removable: true });
      }
      homeInfoWindow.setContent(homeInfoWindowHtml(h));
      homeInfoWindow.open(homeMap, m);
    });
  });
  homeMap.setBounds(bounds);
  relayoutHomeMapSoon();
}

function runHomeHospitalSearch(latlng) {
  if (!homePlaces || !homeMap) return;
  homePlaces.keywordSearch(
    "동물병원",
    (data, st) => applyHomeKeywordResults(data, st),
    { location: latlng, radius: 8000 }
  );
}

async function initHomeMapOnce() {
  if (homeMapInitialized) return;

  const statusEl = document.getElementById("home-map-status");
  await ensureSecretsLoaded();

  if (!hasKakaoKey()) {
    showHomeMapFallback("카카오맵 키를 불러오지 못했습니다. (도메인 등록/환경변수 확인)");
    if (statusEl) statusEl.textContent = "";
    homeMapInitialized = true;
    return;
  }

  const coords = await getUserCoordsOrDefault();

  try {
    await loadKakaoScript();
    hideHomeMapFallback();

    const container = document.getElementById("home-map-container");
    if (!container) {
      homeMapInitialized = true;
      return;
    }

    const center = new kakao.maps.LatLng(coords.lat, coords.lng);
    homeMap = new kakao.maps.Map(container, { center, level: 6 });
    homePlaces = new kakao.maps.services.Places();
    bindHomeMapResize();

    if (statusEl) statusEl.textContent = "현 위치 주변 동물병원을 표시합니다.";

    runHomeHospitalSearch(center);
    relayoutHomeMapSoon();

    const locateBtn = document.getElementById("btn-home-locate");
    if (locateBtn && !locateBtn.dataset.bound) {
      locateBtn.dataset.bound = "1";
      locateBtn.addEventListener("click", async () => {
        if (!homeMap || !homePlaces) return;
        const c = await getUserCoordsOrDefault({ forceFresh: true });
        const ll = new kakao.maps.LatLng(c.lat, c.lng);
        homeMap.setCenter(ll);
        homeMap.setLevel(5);
        runHomeHospitalSearch(ll);
        relayoutHomeMapSoon();
      });
    }

    homeMapInitialized = true;
  } catch {
    showHomeMapFallback("카카오맵을 불러오지 못했습니다. 도메인 등록을 확인하세요.");
    if (statusEl) statusEl.textContent = "";
    homeMapInitialized = true;
  }
}
