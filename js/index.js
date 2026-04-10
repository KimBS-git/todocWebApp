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
let homeMapLifecycleBound = false;
let homeMapResizeObserver = null;

/** 서울시청 중심 — 홈 지도는 GPS 없이 고정 (페이지 전환 시에도 즉시 동일 표시) */
const HOME_MAP_CENTER_LATLNG = { lat: 37.5665, lng: 126.978 };

/**
 * 부모가 display:none이었다가 막 풀린 직후에는 컨테이너 크기가 0인 채로
 * kakao.maps.Map이 생성되면 타일이 영원히 회색으로 남습니다. 레이아웃이 잡힐 때까지 대기합니다.
 */
function waitForHomeMapContainerReady(container) {
  return new Promise((resolve) => {
    let frames = 0;
    const maxFrames = 90;
    const tick = () => {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      if (w > 1 && h > 1) {
        resolve();
        return;
      }
      frames += 1;
      if (frames >= maxFrames) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(() => requestAnimationFrame(tick));
  });
}

function hasKakaoKey() {
  return (
    typeof CONFIG.KAKAO_APP_KEY === "string" && CONFIG.KAKAO_APP_KEY.length > 10
  );
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
  homeMarkers.forEach((m) => {
    try {
      m.setMap(null);
    } catch {
      /* 지도 인스턴스가 이미 해제된 경우 */
    }
  });
  homeMarkers = [];
  if (homeInfoWindow) {
    try {
      homeInfoWindow.close();
    } catch {
      /* ignore */
    }
    homeInfoWindow = null;
  }
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

/** 다른 페이지 갔다가 돌아올 때(bfcache·탭 복귀) 지도가 회색으로 남는 현상 완화 */
function bindHomeMapLifecycle() {
  if (homeMapLifecycleBound) return;
  homeMapLifecycleBound = true;
  window.addEventListener("pageshow", (ev) => {
    if (ev.persisted) {
      if (homeMapResizeObserver) {
        try {
          homeMapResizeObserver.disconnect();
        } catch {
          /* ignore */
        }
        homeMapResizeObserver = null;
      }
      homeMapInitialized = false;
      homeMap = null;
      homePlaces = null;
      clearHomeMarkers();
      const c = document.getElementById("home-map-container");
      if (c) c.innerHTML = "";
      hideHomeMapFallback();
      initHomeMapOnce();
      return;
    }
    if (!homeMap) return;
    relayoutHomeMapSoon();
    [50, 200, 500].forEach((ms) => {
      setTimeout(() => homeMap && homeMap.relayout(), ms);
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !homeMap) return;
    relayoutHomeMapSoon();
    setTimeout(() => homeMap && homeMap.relayout(), 150);
  });
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
  setTimeout(() => homeMap && homeMap.relayout(), 100);
}

function runHomeHospitalSearch(latlng) {
  if (!homePlaces || !homeMap) return;
  homePlaces.keywordSearch(
    "동물병원",
    (data, st) => applyHomeKeywordResults(data, st),
    { location: latlng, radius: 8000 },
  );
}

async function initHomeMapOnce() {
  if (homeMapInitialized) return;

  const statusEl = document.getElementById("home-map-status");
  await ensureSecretsLoaded();

  if (!hasKakaoKey()) {
    showHomeMapFallback(
      "카카오맵 키를 불러오지 못했습니다. (도메인 등록/환경변수 확인)",
    );
    if (statusEl) statusEl.textContent = "";
    homeMapInitialized = true;
    return;
  }

  try {
    await loadKakaoScript();
    hideHomeMapFallback();

    const container = document.getElementById("home-map-container");
    if (!container) {
      homeMapInitialized = true;
      return;
    }

    await waitForHomeMapContainerReady(container);

    const defaultCenter = new kakao.maps.LatLng(
      HOME_MAP_CENTER_LATLNG.lat,
      HOME_MAP_CENTER_LATLNG.lng,
    );
    homeMap = new kakao.maps.Map(container, {
      center: defaultCenter,
      level: 6,
    });
    homePlaces = new kakao.maps.services.Places();
    bindHomeMapResize();
    bindHomeMapLifecycle();

    if (typeof ResizeObserver !== "undefined") {
      if (homeMapResizeObserver) {
        try {
          homeMapResizeObserver.disconnect();
        } catch {
          /* ignore */
        }
      }
      homeMapResizeObserver = new ResizeObserver(() => {
        if (homeMap) homeMap.relayout();
      });
      homeMapResizeObserver.observe(container);
    }

    if (kakao.maps.event && kakao.maps.event.addListener) {
      kakao.maps.event.addListener(homeMap, "tilesloaded", () => {
        relayoutHomeMapSoon();
      });
    }

    relayoutHomeMapSoon();
    [50, 200, 500].forEach((ms) => {
      setTimeout(() => homeMap && homeMap.relayout(), ms);
    });

    if (statusEl) {
      statusEl.textContent = "서울시청 중심 주변 동물병원을 표시합니다.";
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!homeMap || !homePlaces) return;
        homeMap.relayout();
        runHomeHospitalSearch(defaultCenter);
        relayoutHomeMapSoon();
        [100, 300, 600].forEach((ms) => {
          setTimeout(() => homeMap && homeMap.relayout(), ms);
        });
      });
    });

    homeMapInitialized = true;
  } catch (e) {
    console.warn("home map", e);
    showHomeMapFallback(
      "카카오맵을 불러오지 못했습니다. 도메인 등록을 확인하세요.",
    );
    if (statusEl) statusEl.textContent = "";
    homeMapInitialized = true;
  }
}
