/**
 * index.js — 홈(로그인) 페이지
 * 의존: common.js (CONFIG, 스토리지, 인증)
 */

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
    return {
      text: "D-Day",
      className: "res-card__badge res-card__badge--dday",
    };
  if (diff > 0)
    return {
      text: `D-${diff}`,
      className: "res-card__badge res-card__badge--d7",
    };

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
 * [UI] 홈 — 반려동물 카드 (마이페이지와 동일 데이터)
 * ============================================================================= */
function homePetCardHtml(p) {
  const genderLabel = p.gender === "female" ? "암컷" : "수컷";
  const photo =
    p.photo ||
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
        `<rect fill="#e5e7eb" width="64" height="64"/>` +
        `<text x="32" y="38" text-anchor="middle" font-size="24">🐱</text>` +
        `</svg>`,
    )}`;
  const age = p.age != null ? `${p.age}살` : "-";
  return `
    <article class="home-pet-card" role="button" tabindex="0" title="마이페이지로 이동">
      <div class="home-pet-card__thumb">
        <img src="${photo}" alt="${escapeHtml(p.name)}" />
      </div>
      <div class="home-pet-card__meta">
        <strong>${escapeHtml(p.name)}</strong>
        <span>${escapeHtml(p.breed || "")} · ${genderLabel} · ${age}</span>
      </div>
    </article>`;
}

function renderHomePetsBlock(user) {
  const wrap = document.getElementById("home-pets-wrap");
  if (!wrap) return;
  const pets = user.pets || [];
  if (!pets.length) {
    wrap.innerHTML = `<p class="empty-state" style="padding:16px">등록된 반려동물이 없습니다. 마이페이지에서 추가해 보세요.</p>`;
    return;
  }
  wrap.innerHTML = pets.map((p) => homePetCardHtml(p)).join("");
  const goMypage = () => {
    window.location.href = "mypage.html";
  };
  wrap.querySelectorAll(".home-pet-card").forEach((el) => {
    el.addEventListener("click", goMypage);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goMypage();
      }
    });
  });
}

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
    const ddayNumHtml =
      daysLeft === 0
        ? '<span class="dday-badge__num dday-badge__num--today">D-day</span>'
        : `<span class="dday-badge__num">${daysLeft}</span>`;

    upcomingWrap.innerHTML = `
      <div class="upcoming-card upcoming-card--clickable" role="button" tabindex="0" title="예약내역으로 이동">
        <div class="upcoming-card__icon">📅</div>
        <div class="upcoming-card__meta">
          <h3>${escapeHtml(u.hospitalName)}</h3>
          <span>${formatShortDate(u.datetime)}</span>
        </div>
        <div class="dday-badge">
          <span class="dday-badge__label">D-Day</span>
          ${ddayNumHtml}
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

  renderHomePetsBlock(user);
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

  const yy = String(d.getFullYear()).slice(2); // 연도 두 자리
  const mm = String(d.getMonth() + 1).padStart(2, "0"); // 월 두 자리
  const dd = String(d.getDate()).padStart(2, "0"); // 일 두 자리
  const day = weekdays[d.getDay()]; // 요일 한글
  const hh = String(d.getHours()).padStart(2, "0"); // 시 두 자리
  const min = String(d.getMinutes()).padStart(2, "0"); // 분 두 자리

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

// 알림 버튼 클릭 시 메시지 띄우기
document.getElementById("btn-dummy-noti").addEventListener("click", () => {
  alert("알림이 없습니다.");
});

// 빠른 서비스 클릭 시 메시지 띄우기
function readyMessage(serviceName) {
  alert(`${serviceName} 서비스는 준비 중입니다.`);
}
