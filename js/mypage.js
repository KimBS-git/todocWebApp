/**
 * mypage.js — 마이페이지 번들
 * config + storage + auth + UI + modal + 초기화
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
 * mypage.js — 마이페이지 렌더링 (프로필, 반려동물 목록, 설정)
 *
 * 의존: config.js (escapeHtml),
 *       storage.js (getCurrentUser, saveCurrentUserData),
 *       auth.js (logout)
 *
 * 관리자/일반 공통 동작
 *   - 반려동물: 목록이 비어있으면 Empty State + "반려동물 추가하기" 버튼
 *   - 추가: 모달(#modal-pet)로 입력 후 저장
 *   - 삭제: 각 항목의 삭제 버튼으로 삭제
 */

/* =============================================================================
 * [UI] 마이페이지 전체 렌더링
 * #mypage-content에 innerHTML로 전체 내용을 주입합니다.
 * DOM이 교체되므로 이벤트 리스너를 매번 다시 바인딩해야 합니다.
 * ============================================================================= */
function renderMyPage() {
  const user = getCurrentUser();
  const mount = document.getElementById("mypage-content");
  if (!user) return;

  const pets = (user.pets) || [];

  /* ─── 반려동물 목록 블록 생성 ────────────────────────────────
     관리자/일반 공통: 추가/삭제 가능 + 추가 버튼 클릭 시 반려동물 모달 열기 */
  let petsBlock = "";

  if (pets.length === 0) {
    // 일반 사용자, 반려동물 없음
    petsBlock = `
      <p class="empty-state" style="padding:16px">등록된 반려동물이 없습니다.</p>
      <button type="button" class="add-pet-row" id="btn-add-pet">
        <span style="font-size:1.2rem">+</span> 반려동물 추가하기
      </button>`;
  } else {
    // 반려동물 있음
    petsBlock = pets.map((p) => petRowHtml(p)).join("");
    petsBlock += `<button type="button" class="add-pet-row" id="btn-add-pet">
      <span style="font-size:1.2rem">+</span> 반려동물 추가하기
    </button>`;
  }

  /* ─── 전체 HTML 주입 ──────────────────────────────────────────
     프로필 → 반려동물 목록 → 내 정보 관리 순서로 렌더링됩니다. */
  mount.innerHTML = `
    <div class="mypage-profile">
      <div class="avatar">👤</div>
      <div>
        <h2>${escapeHtml(user.displayName || user.username)}</h2>
        <p class="email">${escapeHtml(user.email || "")}</p>
      </div>
    </div>

    <h3 class="subsection-title">나의 반려동물</h3>
    <div class="pet-list-card">${petsBlock}</div>

    <h3 class="subsection-title">내 정보 관리</h3>
    <div class="settings-card">
      <button type="button" class="settings-row" id="btn-edit-profile">
        👤 프로필 수정
      </button>
      <button type="button" class="settings-row" id="btn-logout">
        🚪 로그아웃
      </button>
    </div>`;

  /* ─── 이벤트 바인딩 (innerHTML 교체 후 재바인딩 필요) ──────── */

  // 반려동물 추가 버튼 (관리자/일반 공통)
  const addBtn = document.getElementById("btn-add-pet");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      document.getElementById("modal-pet").classList.add("is-open");
    });
  }

  // 반려동물 삭제 버튼 (관리자/일반 공통)
  mount.querySelectorAll(".btn-pet-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (!confirm("삭제할까요?")) return;

      // 해당 id를 제외한 새 배열로 교체
      const next = (getCurrentUser().pets || []).filter((p) => p.id !== id);
      saveCurrentUserData({ pets: next });

      renderMyPage(); // 삭제 후 목록 갱신
    });
  });

  // 반려동물 수정 버튼 (관리자/일반 공통)
  mount.querySelectorAll(".btn-pet-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const u = getCurrentUser();
      if (!u) return;
      const pet = (u.pets || []).find((p) => String(p.id) === String(id));
      if (!pet) return;

      // modal.js가 읽을 수 있도록 커스텀 이벤트로 편집 정보를 전달
      window.dispatchEvent(
        new CustomEvent("todoc:openPetModal", { detail: { mode: "edit", pet } })
      );
    });
  });

  // 로그아웃 버튼
  document.getElementById("btn-logout").addEventListener("click", logout);

  document.getElementById("btn-edit-profile").addEventListener("click", openProfileModal);
}

/* =============================================================================
 * [UI] 반려동물 행(Row) HTML 생성
 * 썸네일 + 이름/정보 + 수정·삭제 버튼으로 구성된 한 행을 반환합니다.
 *
 * @param {Object} p - 반려동물 객체 { id, name, breed, gender, age, photo }
 * @returns {string} HTML 문자열
 * ============================================================================= */
function petRowHtml(p) {
  const genderLabel = p.gender === "female" ? "암컷" : "수컷";

  // 사진이 없으면 SVG 이모지 아이콘을 data URL로 생성해 기본 이미지로 사용
  const photo =
    p.photo ||
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">` +
      `<rect fill="#e5e7eb" width="48" height="48"/>` +
      `<text x="24" y="28" text-anchor="middle" font-size="20">🐱</text>` +
      `</svg>`
    )}`;

  return `
    <div class="pet-row">
      <div class="pet-thumb">
        <img src="${photo}" alt="${escapeHtml(p.name)} 사진" />
      </div>
      <div class="pet-info">
        <strong>${escapeHtml(p.name)}</strong>
        <span>${escapeHtml(p.breed || "")} · ${genderLabel} · ${
          p.age != null ? p.age + "살" : "-"
        }</span>
      </div>
      <div class="pet-actions">
        <button
          type="button"
          class="btn-pet-edit"
          data-id="${escapeHtml(p.id)}"
          title="수정">✏️</button>
        <button
          type="button"
          class="delete btn-pet-del"
          data-id="${escapeHtml(p.id)}"
          title="삭제">🗑</button>
      </div>
    </div>`;
}
/**
 * modal.js — 반려동물 추가 모달 (#modal-pet) 설정
 *
 * 의존: config.js (uid, escapeHtml),
 *       storage.js (getCurrentUser, saveCurrentUserData),
 *       mypage.js (renderMyPage)
 *
 * 예약 모달(#modal-book)의 열기/닫기는 map.js의
 * openBookModal() / closeBookModal()에서 처리합니다.
 * 예약 모달의 form submit 이벤트는 app.js에서 바인딩합니다.
 */

/* =============================================================================
 * [기능] 반려동물 추가 모달 초기화
 * 앱 시작 시 한 번만 호출해 이벤트를 등록합니다.
 * ============================================================================= */
function setupPetModal() {
  const modal    = document.getElementById("modal-pet");
  const photoInput = document.getElementById("pet-photo");
  const preview  = document.getElementById("pet-photo-preview");
  const titleEl = document.getElementById("modal-pet-title");
  const formEl = document.getElementById("form-pet");
  const submitBtn = formEl.querySelector('button[type="submit"]');

  // 편집 상태: 모달 dataset에 저장(추가/수정 구분)
  modal.dataset.mode = "add";
  modal.dataset.editingId = "";

  function resetModalUI() {
    modal.dataset.mode = "add";
    modal.dataset.editingId = "";
    titleEl.textContent = "반려동물 추가";
    if (submitBtn) submitBtn.textContent = "저장";
    formEl.reset();
    preview.classList.add("hidden");
    preview.src = "";
  }

  /* ─── 사진 파일 선택 → 미리보기 표시 ─────────────────────────
     FileReader API로 선택한 이미지 파일을 base64 data URL로 읽어
     <img> 태그의 src에 바로 넣어 미리보기를 제공합니다.
     나중에 form submit 시 이 data URL을 photo 값으로 저장합니다. */
  photoInput.addEventListener("change", () => {
    const file = photoInput.files && photoInput.files[0];

    if (!file) {
      preview.classList.add("hidden"); // 파일 선택 취소 시 미리보기 숨김
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      preview.src = reader.result;      // data URL을 src에 설정
      preview.classList.remove("hidden"); // 미리보기 표시
    };
    reader.readAsDataURL(file); // 파일을 base64 data URL로 읽기 시작
  });

  /* ─── 모달 닫기: × 버튼 클릭 ────────────────────────────────── */
  document.getElementById("modal-pet-close").addEventListener("click", () => {
    modal.classList.remove("is-open");
    resetModalUI();
  });

  /* ─── 모달 닫기: 백드롭(배경) 클릭 ─────────────────────────────
     e.target이 모달 배경 자체일 때만 닫히도록 합니다.
     모달 내부 요소 클릭 시에는 이벤트가 전파되지 않도록 합니다. */
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("is-open");
      resetModalUI();
    }
  });

  /* ─── 폼 제출: 반려동물 추가 ────────────────────────────────────
     유효성 검사는 HTML5 required/minlength가 처리합니다.
     관리자/일반 모두 반려동물 추가가 가능합니다. */
  formEl.addEventListener("submit", (e) => {
    e.preventDefault(); // 기본 폼 제출(페이지 새로고침) 방지

    const user = getCurrentUser();
    if (!user) return;

    // 폼 필드 값 수집
    const name   = document.getElementById("pet-name").value.trim();
    const breed  = document.getElementById("pet-breed").value.trim();
    const ageVal = document.getElementById("pet-age").value;
    const age    = ageVal === "" ? null : Number(ageVal); // 비어있으면 null
    const gender = document.querySelector('input[name="pet-gender"]:checked').value;

    // 사진: 미리보기 이미지가 있으면 base64 data URL, 없으면 빈 문자열
    const photo =
      preview.src && !preview.classList.contains("hidden")
        ? preview.src
        : "";

    // 새 반려동물 객체 생성 (uid()로 고유 ID 부여)
    const mode = modal.dataset.mode || "add";
    const editingId = modal.dataset.editingId || "";
    const newPet = {
      id: mode === "edit" && editingId ? editingId : uid(),
      name,
      breed,
      age,
      gender,
      photo,
    };

    // 기존 목록에 추가/수정해 저장
    let pets = [...(user.pets || [])];
    if (mode === "edit" && editingId) {
      pets = pets.map((p) => (String(p.id) === String(editingId) ? newPet : p));
    } else {
      pets.push(newPet);
    }
    saveCurrentUserData({ pets });

    // 정리: 모달 닫기 + 폼 초기화 + 미리보기 숨기기 + 마이페이지 갱신
    modal.classList.remove("is-open");
    resetModalUI();
    renderMyPage();
  });

  /* ─── 외부(마이페이지)에서 모달 열기: 추가/수정 공통 ─────────────
     mypage.js에서 CustomEvent('todoc:openPetModal')로 전달합니다. */
  window.addEventListener("todoc:openPetModal", (e) => {
    const detail = (e && e.detail) || {};
    const mode = detail.mode || "add";
    const pet = detail.pet || null;

    resetModalUI();

    if (mode === "edit" && pet) {
      modal.dataset.mode = "edit";
      modal.dataset.editingId = String(pet.id || "");
      titleEl.textContent = "반려동물 수정";
      if (submitBtn) submitBtn.textContent = "수정 저장";

      // 폼 값 채우기
      document.getElementById("pet-name").value = pet.name || "";
      document.getElementById("pet-breed").value = pet.breed || "";
      document.getElementById("pet-age").value = pet.age != null ? String(pet.age) : "";
      const gender = pet.gender === "female" ? "female" : "male";
      const radio = document.querySelector(`input[name="pet-gender"][value="${gender}"]`);
      if (radio) radio.checked = true;

      // 기존 사진이 있으면 미리보기로 보여주기 (새 파일 선택은 선택 사항)
      if (pet.photo) {
        preview.src = pet.photo;
        preview.classList.remove("hidden");
      }
    }

    modal.classList.add("is-open");
  });
}
/* =============================================================================
 * mypage.html — 페이지 초기화 (인라인 스크립트 통합)
 * ============================================================================= */
const PROFILE_PHONE_PATTERN = /^\d{3}-\d{4}-\d{4}$/;

function setProfilePhoneError(show) {
  const el = document.getElementById("profile-phone-error");
  if (el) el.classList.toggle("hidden", !show);
}

function openProfileModal() {
  const u = getCurrentUser();
  if (!u) return;
  document.getElementById("profile-display-name").value = u.displayName || "";
  document.getElementById("profile-phone").value = u.phone || "";
  document.getElementById("profile-username").value = u.username || "";
  document.getElementById("profile-password").value = "";
  document.getElementById("profile-password-confirm").value = "";
  setProfilePhoneError(false);
  document.getElementById("modal-profile").classList.add("is-open");
}

function closeProfileModal() {
  document.getElementById("modal-profile").classList.remove("is-open");
}

function saveProfileForm(e) {
  e.preventDefault();
  const displayName = document.getElementById("profile-display-name").value.trim();
  const phone = document.getElementById("profile-phone").value.trim();
  const newUsername = document.getElementById("profile-username").value.trim();
  const pw = document.getElementById("profile-password").value;
  const pw2 = document.getElementById("profile-password-confirm").value;

  if (phone && !PROFILE_PHONE_PATTERN.test(phone)) {
    setProfilePhoneError(true);
    return;
  }
  setProfilePhoneError(false);

  if (!newUsername) {
    alert("아이디를 입력하세요.");
    return;
  }
  if (pw && pw !== pw2) {
    alert("비밀번호 확인이 일치하지 않습니다.");
    return;
  }

  const session = getSession();
  const users = loadUsers();
  if (!users || !users[session]) return;

  if (newUsername !== session && users[newUsername]) {
    alert("이미 사용 중인 아이디입니다.");
    return;
  }

  const data = { ...users[session] };
  data.displayName = displayName;
  data.phone = phone;
  if (pw) data.password = pw;

  if (newUsername !== session) {
    delete users[session];
    users[newUsername] = data;
    saveUsers(users);
    setSession(newUsername);
  } else {
    users[session] = data;
    saveUsers(users);
  }

  closeProfileModal();
  renderMyPage();
  alert("저장되었습니다.");
}

(function authCheckMypage() {
  ensureUsersStorage();
  if (!getSession() || !getCurrentUser()) {
    window.location.href = "index.html";
  }
})();

renderMyPage();
setupPetModal();

document.getElementById("form-profile").addEventListener("submit", saveProfileForm);
document.getElementById("modal-profile-close").addEventListener("click", closeProfileModal);
document.getElementById("modal-profile-x").addEventListener("click", closeProfileModal);
document.getElementById("modal-profile").addEventListener("click", (e) => {
  if (e.target.id === "modal-profile") closeProfileModal();
});
document.getElementById("profile-phone").addEventListener("input", () => {
  const v = document.getElementById("profile-phone").value.trim();
  if (!v || PROFILE_PHONE_PATTERN.test(v)) setProfilePhoneError(false);
});

document.getElementById("btn-dummy-noti").addEventListener("click", () => {
  alert("알림이 없습니다.");
});
