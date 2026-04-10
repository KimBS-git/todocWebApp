/**
 * book.js — 예약내역 페이지 번들
 * config + storage + auth + reservations + 초기화
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

/**
 * 예약 상세·모달용 날짜 문자열
 */
function formatReservationDatetime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const day = weekdays[d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yy}.${mm}.${dd} (${day}) ${hh}:${min}`;
}

function updateReservationReview(resId, review) {
  const user = getCurrentUser();
  if (!user) return;
  const next = (user.reservations || []).map((r) =>
    String(r.id) === String(resId) ? { ...r, review } : r
  );
  saveCurrentUserData({ reservations: next });
}

function closeReservationDetailModal() {
  document.getElementById("modal-res-detail").classList.remove("is-open");
}

function openReservationDetailModal(r) {
  const badge = ddayBadge(r.datetime);
  document.getElementById("modal-res-detail-body").innerHTML = `
    <dl class="res-detail-dl">
      <dt>병원명</dt><dd>${escapeHtml(r.hospitalName || "—")}</dd>
      <dt>주소</dt><dd>${escapeHtml(r.address || "—")}</dd>
      <dt>전화번호</dt><dd>${escapeHtml(r.phone || "—")}</dd>
      <dt>진료 목적</dt><dd>${escapeHtml(r.reason || "—")}</dd>
      <dt>반려동물 이름</dt><dd>${escapeHtml(r.petName || "—")}</dd>
      <dt>예약 일시</dt><dd>${escapeHtml(formatReservationDatetime(r.datetime))}</dd>
      <dt>D-Day</dt><dd><strong>${escapeHtml(badge.text)}</strong></dd>
    </dl>`;
  document.getElementById("modal-res-detail").classList.add("is-open");
}

function closeBookModalBook() {
  document.getElementById("modal-book").classList.remove("is-open");
}

const PHONE_DASH_PATTERN = /^\d{3}-\d{4}-\d{4}$/;

function isValidBookPhone(v) {
  return PHONE_DASH_PATTERN.test((v || "").trim());
}

function setBookingDatetimeMinNow() {
  const el = document.getElementById("book-datetime");
  if (!el) return;
  const n = new Date();
  n.setMinutes(n.getMinutes() - n.getTimezoneOffset());
  el.min = n.toISOString().slice(0, 16);
  if (el.value && el.min && el.value < el.min) el.value = el.min;
}

function setBookPhoneErrorVisible(show) {
  const err = document.getElementById("book-phone-error");
  if (err) err.classList.toggle("hidden", !show);
}

function openBookModalFromReservation(r) {
  document.getElementById("book-place-id").value = r.placeId || "";
  document.getElementById("book-place-name").value = r.hospitalName || "";
  document.getElementById("book-place-address").value = r.address || "";
  document.getElementById("book-place-phone").value = r.phone || "";
  document.getElementById("book-place-y").value = r.y || "";
  document.getElementById("book-place-x").value = r.x || "";

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById("book-datetime").value = now.toISOString().slice(0, 16);

  const user = getCurrentUser();
  const firstPet = user && user.pets && user.pets[0];
  const petNameEl = document.getElementById("book-pet-name");
  if (petNameEl) {
    petNameEl.value = (r.petName || (firstPet ? firstPet.name : "") || "").trim();
  }
  document.getElementById("book-reason").value = r.reason || "";

  document.getElementById("modal-book-body").innerHTML = `
    <p style="margin:0 0 12px;font-size:0.9rem;color:var(--color-text-muted)">
      <strong>${escapeHtml(r.hospitalName || "")}</strong><br/>
      ${escapeHtml(r.address || "")}
    </p>`;

  setBookingDatetimeMinNow();
  setBookPhoneErrorVisible(false);
  document.getElementById("modal-book").classList.add("is-open");
}

let reviewTargetId = null;

function setReviewStarButtons(value) {
  document.getElementById("review-star-value").value = String(value);
  document.querySelectorAll("#review-stars-input .review-star-btn").forEach((btn) => {
    const n = Number(btn.getAttribute("data-star"));
    btn.classList.toggle("is-active", n <= value);
  });
}

function closeReviewModal() {
  document.getElementById("modal-review").classList.remove("is-open");
  reviewTargetId = null;
  document.getElementById("review-comment").value = "";
  setReviewStarButtons(0);
}

function openReviewModal(resId) {
  reviewTargetId = resId;
  const user = getCurrentUser();
  const r = (user.reservations || []).find((x) => String(x.id) === String(resId));
  const stars = r && r.review && r.review.stars ? r.review.stars : 0;
  document.getElementById("review-comment").value =
    r && r.review && r.review.comment ? r.review.comment : "";
  setReviewStarButtons(stars);
  document.getElementById("modal-review").classList.add("is-open");
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
      const id = btn.getAttribute("data-id");
      const user = getCurrentUser();
      const r = (user.reservations || []).find((x) => String(x.id) === String(id));
      if (r) openReservationDetailModal(r);
    });
  });

  document.querySelectorAll(".btn-res-rebook").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const user = getCurrentUser();
      const r = (user.reservations || []).find((x) => String(x.id) === String(id));
      if (r) openBookModalFromReservation(r);
    });
  });

  document.querySelectorAll(".btn-res-review").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (id) openReviewModal(id);
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
  const reviewStars =
    !showDday && r.review && r.review.stars
      ? `<div class="res-card__review" title="후기 별점">${"★".repeat(r.review.stars)}${"☆".repeat(5 - r.review.stars)}</div>`
      : "";

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
          ${reviewStars}
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
/* =============================================================================
 * book.html — 페이지 초기화 (인라인 스크립트 통합)
 * ============================================================================= */
(function authCheckBook() {
  ensureUsersStorage();
  if (!getSession() || !getCurrentUser()) {
    window.location.href = "index.html";
  }
})();

renderReservationPage();

document.querySelectorAll(".res-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".res-tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");

    const isPast = tab.dataset.resTab === "past";
    document.getElementById("res-list-upcoming").classList.toggle("hidden", isPast);
    document.getElementById("res-list-past").classList.toggle("hidden", !isPast);
  });
});

(function syncBookTabFromUrl() {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "past") {
    document.querySelector('.res-tab[data-res-tab="past"]')?.click();
  }
})();

document.getElementById("btn-dummy-noti").addEventListener("click", () => {
  alert("알림이 없습니다.");
});

document.getElementById("modal-res-detail-close").addEventListener("click", closeReservationDetailModal);
document.getElementById("modal-res-detail-x").addEventListener("click", closeReservationDetailModal);
document.getElementById("modal-res-detail").addEventListener("click", (e) => {
  if (e.target.id === "modal-res-detail") closeReservationDetailModal();
});

document.getElementById("modal-book-close").addEventListener("click", closeBookModalBook);
document.getElementById("modal-book").addEventListener("click", (e) => {
  if (e.target.id === "modal-book") closeBookModalBook();
});

document.getElementById("form-book").addEventListener("submit", (e) => {
  e.preventDefault();
  setBookingDatetimeMinNow();
  const dtEl = document.getElementById("book-datetime");
  const phoneEl = document.getElementById("book-phone");
  const record = {
    id: uid(),
    hospitalName: document.getElementById("book-place-name").value,
    address: document.getElementById("book-place-address").value,
    phone: document.getElementById("book-place-phone").value,
    petName: (document.getElementById("book-pet-name")?.value || "").trim() || "반려동물",
    reason: document.getElementById("book-reason").value,
    datetime: dtEl.value,
    placeId: document.getElementById("book-place-id").value,
    y: document.getElementById("book-place-y").value,
    x: document.getElementById("book-place-x").value,
  };
  if (!record.datetime) {
    alert("일시를 선택하세요.");
    return;
  }
  if (dtEl.min && record.datetime < dtEl.min) {
    alert("예약 일시는 현재 시각 이후로 선택해 주세요.");
    return;
  }
  if (!isValidBookPhone(phoneEl.value)) {
    setBookPhoneErrorVisible(true);
    return;
  }
  setBookPhoneErrorVisible(false);
  addReservation(record);
  closeBookModalBook();
  alert("예약이 저장되었습니다.");
  renderReservationPage();
});

document.getElementById("book-phone").addEventListener("input", () => {
  if (isValidBookPhone(document.getElementById("book-phone").value)) {
    setBookPhoneErrorVisible(false);
  }
});

document.querySelectorAll("#review-stars-input .review-star-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = Number(btn.getAttribute("data-star"));
    setReviewStarButtons(v);
  });
});

document.getElementById("modal-review-save").addEventListener("click", () => {
  const stars = Number(document.getElementById("review-star-value").value);
  const comment = document.getElementById("review-comment").value.trim();
  if (!reviewTargetId) return;
  if (!stars || stars < 1) {
    alert("별점을 선택해 주세요.");
    return;
  }
  updateReservationReview(reviewTargetId, { stars, comment });
  closeReviewModal();
  renderReservationPage();
});

document.getElementById("modal-review-close").addEventListener("click", closeReviewModal);
document.getElementById("modal-review-x").addEventListener("click", closeReviewModal);
document.getElementById("modal-review").addEventListener("click", (e) => {
  if (e.target.id === "modal-review") closeReviewModal();
});
