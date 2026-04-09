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
 * 카카오 개발자 콘솔(https://developers.kakao.com)에서
 * 앱 생성 후 "JavaScript 키"를 발급받아 아래 빈 문자열에 붙여넣으세요.
 * 비워두면 카카오맵 없이 목업(MOCK) 병원 목록만 표시됩니다.
 * ============================================================================= */
const CONFIG = {
  KAKAO_APP_KEY: "", // 예: "abcdef1234567890abcdef1234567890"
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
const MOCK_VET_HOSPITALS = [
  {
    id: "mock-h1",
    place_name: "행복 동물병원",
    address_name: "서울 강남구 테헤란로 123",
    road_address_name: "서울 강남구 테헤란로 123",
    phone: "02-1234-5678",
    x: "127.027619",
    y: "37.497942",
    tags: ["all", "open"],
  },
  {
    id: "mock-h2",
    place_name: "하이유 동물병원",
    address_name: "서울 서초구 서초대로 456",
    road_address_name: "서울 서초구 서초대로 456",
    phone: "02-9876-5432",
    x: "127.024612",
    y: "37.494850",
    tags: ["all", "weekend", "open"],
  },
  {
    id: "mock-h3",
    place_name: "24시 응급 동물의료센터",
    address_name: "서울 송파구 올림픽로 789",
    road_address_name: "서울 송파구 올림픽로 789",
    phone: "02-5555-1111",
    x: "127.105399",
    y: "37.514575",
    tags: ["all", "24h", "emergency", "open"],
  },
];

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
 * [초기화] 최초 실행 시 시드 데이터 생성
 * 앱을 처음 열면 관리자 계정(admin/admin)과 샘플 예약을 자동으로 생성합니다.
 * 이미 데이터가 있으면 덮어쓰지 않습니다(early return).
 * ============================================================================= */
function seedInitialUsers() {
  if (loadUsers()) return; // 이미 데이터가 있으면 스킵

  const users = {
    admin: {
      password: "admin",
      isAdmin: true,
      displayName: "김보호자님",
      email: "petlover@example.com",
      // 관리자도 일반 사용자처럼 반려동물은 빈 상태에서 시작
      pets: [],
      reservations: [
        {
          id: "res-seed-1",
          hospitalName: "행복 동물병원",
          address: "서울 강남구",
          petName: "뭉치",
          reason: "정기검진",
          datetime: "2026-04-07T11:33", // 시드 예약 날짜
          placeId: "seed",
        },
      ],
    },
  };

  saveUsers(users);
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
  seedInitialUsers(); // 최초 실행 시 관리자 계정이 없으면 자동 생성

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
  seedInitialUsers();

  const users = loadUsers() || {};

  // 아이디 중복 검사
  if (users[username]) {
    alert("이미 사용 중인 아이디입니다.");
    return false;
  }

  // 새 사용자 객체 생성 (isAdmin: false, pets·reservations 빈 배열로 시작)
  users[username] = {
    password,
    isAdmin: false,
    displayName: `${username}님`,        // 기본 표시 이름: "아이디님"
    email: `${username}@example.com`,    // 기본 이메일 (데모용)
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

/* =============================================================================
 * [기능] 예약 추가
 * 현재 사용자의 예약 목록에 새 예약 레코드를 추가하고 localStorage에 저장합니다.
 * ============================================================================= */

/**
 * @param {{ id, hospitalName, address, petName, reason, datetime, placeId }} record
 */
function addReservation(record) {
  const user = getCurrentUser();
  if (!user) return;

  const list = [...(user.reservations || []), record]; // 기존 목록에 추가
  saveCurrentUserData({ reservations: list });
}

/* =============================================================================
 * [UI] 예약내역 페이지 전체 렌더링
 * "예정된 예약" 탭과 "지난 예약" 탭의 내용을 각각 채웁니다.
 * ============================================================================= */
function renderReservationPage() {
  const user = getCurrentUser();
  if (!user) return;

  const { upcoming, past } = splitReservationsByTime(user.reservations || []);

  const elUp   = document.getElementById("res-list-upcoming");
  const elPast = document.getElementById("res-list-past");

  // 예정된 예약: 카드 목록 또는 빈 상태 메시지
  elUp.innerHTML = upcoming.length
    ? upcoming.map((r) => resCardHtml(r, true)).join("")
    : `<div class="empty-state">예정된 예약이 없습니다.</div>`;

  // 지난 예약: D-day 뱃지 없이 카드 렌더링
  elPast.innerHTML = past.length
    ? past.map((r) => resCardHtml(r, false)).join("")
    : `<div class="empty-state">지난 예약이 없습니다.</div>`;

  // innerHTML로 DOM이 교체되므로 매번 이벤트 재바인딩
  bindReservationActions();
}

/* =============================================================================
 * [UI] 예약 카드 버튼 이벤트
 * - 상세보기: 데모 알림
 * - 재예약/후기작성: 데모 알림
 * - 예약취소: 현재 사용자 예약 목록에서 해당 id 제거(데모)
 * ============================================================================= */
function bindReservationActions() {
  document.querySelectorAll(".btn-res-detail").forEach((btn) => {
    btn.addEventListener("click", () => {
      alert("데모: 상세보기는 연결되지 않았습니다.");
    });
  });

  document.querySelectorAll(".btn-res-rebook").forEach((btn) => {
    btn.addEventListener("click", () => {
      alert("데모: 재예약은 연결되지 않았습니다.");
    });
  });

  document.querySelectorAll(".btn-res-review").forEach((btn) => {
    btn.addEventListener("click", () => {
      alert("데모: 후기작성은 연결되지 않았습니다.");
    });
  });

  document.querySelectorAll(".btn-res-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (!id) return;
      if (!confirm("예약을 취소할까요?")) return;
      const user = getCurrentUser();
      if (!user) return;
      const next = (user.reservations || []).filter((r) => String(r.id) !== String(id));
      saveCurrentUserData({ reservations: next });
      renderReservationPage();
    });
  });
}

/* =============================================================================
 * [UI] 예약 카드 HTML 생성
 * 하나의 예약 레코드를 카드 HTML 문자열로 변환합니다.
 * showDday가 true이면 D-day 뱃지를 포함합니다.
 * ============================================================================= */

/**
 * @param {{ id, hospitalName, petName, reason, datetime }} r - 예약 레코드
 * @param {boolean} showDday - D-day 뱃지 표시 여부 (예정된 예약만 true)
 * @returns {string} HTML 문자열
 */
function resCardHtml(r, showDday) {
  const badge = showDday ? ddayBadge(r.datetime) : null;
  const pet = r.petName || "—";
  const dtText = r.datetime ? r.datetime.replace("T", " ") : "";

  return `
    <article class="res-card">
      <div class="res-card__top">
        <div class="res-card__icon">+</div>
        <div class="res-card__info">
          <h3>${escapeHtml(r.hospitalName)}</h3>
          <p class="sub">${escapeHtml(pet)} · ${escapeHtml(r.reason || "")}</p>
        </div>
        <div class="res-card__right">
          <div class="res-card__date">${escapeHtml(dtText)}</div>
          ${badge ? `<div class="${badge.className} res-card__badge--stacked">${badge.text}</div>` : ""}
        </div>
      </div>
      <div class="res-card__divider"></div>
      <div class="res-card__bottom">
        ${
          showDday
            ? `
              <div class="res-card__actions">
                <button type="button" class="res-card__action btn-res-detail" data-id="${escapeHtml(r.id)}">상세보기</button>
                <button type="button" class="res-card__action btn-res-cancel" data-id="${escapeHtml(r.id)}">예약취소</button>
              </div>`
            : `
              <div class="res-card__actions">
                <button type="button" class="res-card__action btn-res-rebook" data-id="${escapeHtml(r.id)}">재예약</button>
                <button type="button" class="res-card__action btn-res-review" data-id="${escapeHtml(r.id)}">후기작성</button>
              </div>`
        }
      </div>
    </article>`;
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
    const badge = ddayBadge(u.datetime);

    upcomingWrap.innerHTML = `
      <div class="upcoming-card">
        <div class="upcoming-card__icon">📅</div>
        <div class="upcoming-card__meta">
          <h3>${escapeHtml(u.hospitalName)}</h3>
          <span>${formatShortDate(u.datetime)}</span>
        </div>
        <div class="dday-badge">${badge.text}<span>${formatDdayPlus(u.datetime)}</span></div>
      </div>`;
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
 * 오늘로부터 예약일까지의 일수 차이를 반환합니다.
 * 양수: 미래 / 음수: 과거
 * @param {string} iso - ISO 날짜 문자열
 * @returns {number}
 */
function dayDiff(iso) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / (1000 * 60 * 60 * 24));
}

/**
 * 홈 D-day 뱃지 하단에 표시되는 "+N" / "-N" 형식의 문자열을 반환합니다.
 * 예: 3일 후 → "+3", 2일 전 → "-2"
 * @param {string} iso
 * @returns {string}
 */
function formatDdayPlus(iso) {
  const n = dayDiff(iso);
  if (n >= 0) return `+${n}`;
  return String(n);
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
  seedInitialUsers();

  if (getSession() && getCurrentUser()) {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");
    renderHome();
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
  alert("데모: 알림이 없습니다.");
});

function readyMessage(serviceName) {
  alert(`${serviceName} 서비스는 준비 중입니다.`);
}
