/* global kakao */
/**
 * search.js — 병원검색 페이지
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

  const elUp = document.getElementById("res-list-upcoming");
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
      const next = (user.reservations || []).filter(
        (r) => String(r.id) !== String(id),
      );
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
 * map.js — 카카오맵 초기화, 병원 검색, 검색 결과 렌더링
 *
 * 의존: config.js (CONFIG, kakaoMap, mapMarkers,
 *                  placesService, mapInitialized, activeFilter, escapeHtml)
 *
 * 흐름:
 *   1. initMapOnce() — 최초 1회 지도 초기화 (카카오 SDK 동적 로드)
 *   2. searchHospitalsKeyword() — 키워드로 주변 동물병원 검색
 *   3. renderHospitalList() — 검색 결과를 카드 목록으로 렌더링
 *   4. openBookModal() — 병원 카드의 "예약하기" 버튼 클릭 시 모달 열기
 */

let kakaoMap = null;
let placesService = null;
let mapMarkers = [];
let mapInitialized = false;
/** Places 키워드 검색이 겹칠 때(기본좌표 검색 vs GPS 이후 검색) 오래된 콜백이 지도를 덮지 않도록 함 */
let hospitalSearchSeq = 0;
let searchInfoWindow = null;
let searchMapResizeBound = false;
let searchMapLifecycleBound = false;
let activeFilter = "all";

/* 병원검색 페이지 위치 캐시(탭 단위). 로그인·예약 데이터는 localStorage(common.js). */
const TODOC_GEO_SEARCH_KEY = "todoc_geo_v1";

/** sessionStorage.setItem 실패 시에도 같은 탭에서 재사용 */
let geoCoordsMemory = null;

function normalizeGeoPair(o) {
  if (!o || typeof o !== "object") return null;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function readGeoCacheSearch() {
  try {
    const raw = sessionStorage.getItem(TODOC_GEO_SEARCH_KEY);
    if (raw) {
      const n = normalizeGeoPair(JSON.parse(raw));
      if (n) {
        geoCoordsMemory = n;
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return geoCoordsMemory;
}

function writeGeoCacheSearch(coords) {
  const n = normalizeGeoPair(coords);
  if (!n) return;
  geoCoordsMemory = n;
  try {
    sessionStorage.setItem(TODOC_GEO_SEARCH_KEY, JSON.stringify(n));
  } catch {
    /* 사생활 보호 브라우징·스토리지 거부 등 — 메모리만 유지 */
  }
}

/* =============================================================================
 * [기능] 카카오 API 키 존재 여부 확인
 * 키가 10자 이상이면 실제 API를 사용하고, 아니면 목업 모드로 동작합니다.
 * ============================================================================= */
function hasKakaoKey() {
  return (
    typeof CONFIG.KAKAO_APP_KEY === "string" && CONFIG.KAKAO_APP_KEY.length > 10
  );
}

/* =============================================================================
 * [기능] 카카오맵 SDK 동적 로드
 * <script> 태그를 동적으로 생성해 카카오 SDK를 비동기로 불러옵니다.
 * autoload=false: SDK 로드 후 kakao.maps.load()를 직접 호출해 초기화합니다.
 * (autoload=true면 스크립트 로드 즉시 지도가 초기화되어 제어가 어렵습니다)
 * ============================================================================= */
function loadKakaoScript() {
  return new Promise((resolve, reject) => {
    // 이미 SDK가 로드된 경우 바로 resolve
    if (typeof kakao !== "undefined" && kakao.maps) {
      resolve();
      return;
    }

    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${CONFIG.KAKAO_APP_KEY}&libraries=services&autoload=false`;
    // libraries=services: 장소 검색(Places) 서비스 포함

    s.onload = () => {
      if (typeof kakao !== "undefined") {
        kakao.maps.load(resolve); // SDK 준비 완료 후 resolve 호출
      } else {
        reject(new Error("kakao 객체를 찾을 수 없습니다"));
      }
    };

    s.onerror = () => reject(new Error("카카오맵 스크립트 로드 실패"));
    document.head.appendChild(s);
  });
}

/* =============================================================================
 * [UI] 지도 폴백 표시/숨기기
 * 카카오맵 로드 실패 시 격자 패턴의 대체 UI를 보여줍니다.
 * ============================================================================= */

/** 폴백 UI를 표시하고 지도 컨테이너를 숨깁니다. */
function showMapFallback(message) {
  const el = document.getElementById("map-fallback");
  const container = document.getElementById("map-container");
  el.textContent = message;
  el.classList.remove("hidden");
  container.classList.add("hidden");
}

/** 폴백 UI를 숨기고 지도 컨테이너를 표시합니다. */
function hideMapFallback() {
  document.getElementById("map-fallback").classList.add("hidden");
  document.getElementById("map-container").classList.remove("hidden");
}

function getUserCoordsOrDefault(options = {}) {
  const preferSessionCache = options.preferSessionCache === true;
  const forceFresh = options.forceFresh === true;
  if (preferSessionCache && !forceFresh) {
    const c = readGeoCacheSearch();
    if (c) return Promise.resolve({ lat: c.lat, lng: c.lng, _from: "cache" });
  }
  const maxAgeMs =
    typeof options.maximumAge === "number"
      ? options.maximumAge
      : forceFresh
        ? 0
        : 60000;
  return new Promise((resolve) => {
    const fallback = readGeoCacheSearch() || { lat: 37.5665, lng: 126.978 };
    if (!navigator.geolocation) {
      resolve({ ...fallback, _from: "no_api" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const o = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        writeGeoCacheSearch(o);
        resolve({ ...o, _from: "gps" });
      },
      () =>
        resolve({
          ...(readGeoCacheSearch() || fallback),
          _from: "fallback",
        }),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: maxAgeMs,
      },
    );
  });
}

function bindSearchMapResize() {
  if (searchMapResizeBound) return;
  searchMapResizeBound = true;
  window.addEventListener("resize", () => {
    if (kakaoMap) kakaoMap.relayout();
  });
}

/** 뒤로가기(bfcache)·탭 복귀 시 타일이 회색으로 남는 현상 완화 */
function bindSearchMapLifecycle() {
  if (searchMapLifecycleBound) return;
  searchMapLifecycleBound = true;
  window.addEventListener("pageshow", () => {
    if (!kakaoMap) return;
    relayoutSearchMapSoon();
    [50, 200, 500].forEach((ms) => {
      setTimeout(() => {
        if (kakaoMap) kakaoMap.relayout();
      }, ms);
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !kakaoMap) return;
    relayoutSearchMapSoon();
    setTimeout(() => kakaoMap && kakaoMap.relayout(), 150);
  });
}

function relayoutSearchMapSoon() {
  requestAnimationFrame(() => {
    if (kakaoMap) kakaoMap.relayout();
  });
  setTimeout(() => {
    if (kakaoMap) kakaoMap.relayout();
  }, 250);
}

function searchInfoWindowHtml(h) {
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

function hospitalDetailBodyHtml(h) {
  const name = h.place_name || "—";
  const addr = h.road_address_name || h.address_name || "—";
  const phone = h.phone || "—";
  return `
    <dl class="hospital-detail-dl">
      <dt>병원명</dt><dd>${escapeHtml(name)}</dd>
      <dt>주소</dt><dd>${escapeHtml(addr)}</dd>
      <dt>전화</dt><dd>${escapeHtml(phone)}</dd>
    </dl>`;
}

function openHospitalDetailModal(h) {
  document.getElementById("modal-hospital-detail-title").textContent =
    h.place_name || "병원 정보";
  document.getElementById("modal-hospital-detail-body").innerHTML =
    hospitalDetailBodyHtml(h);
  document.getElementById("modal-hospital-detail").classList.add("is-open");
}

function closeHospitalDetailModal() {
  document.getElementById("modal-hospital-detail").classList.remove("is-open");
}

/* 서울 시청 부근 — GPS 대기 중에도 지도·타일을 먼저 그리기 위한 기본 중심 (index.js 홈 지도와 동일) */
const SEARCH_MAP_DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

/* =============================================================================
 * [기능] 지도 초기화 (최초 1회만 실행)
 * mapInitialized 플래그로 중복 초기화를 방지합니다.
 *
 * API 키 없음 → 폴백 UI
 * API 키 있음 → SDK 로드 → 즉시 기본 좌표로 지도 생성 → 검색 → GPS는 뒤이어 반영
 * (이전: GPS 완료를 await 한 뒤 지도 생성 → 위치 권한/타임아웃 동안 회색 화면만 노출)
 * ============================================================================= */
async function initMapOnce() {
  if (mapInitialized) return;

  const statusEl = document.getElementById("map-status");

  if (!hasKakaoKey()) {
    showMapFallback(
      "카카오맵 키를 불러오지 못했습니다. (Vercel 환경변수 KAKAO_APP_KEY 및 카카오 콘솔 도메인 등록을 확인하세요.)",
    );
    statusEl.textContent = "";
    renderHospitalList([]);
    mapInitialized = true;
    return;
  }

  try {
    await loadKakaoScript();
    hideMapFallback();

    const container = document.getElementById("map-container");
    const center = new kakao.maps.LatLng(
      SEARCH_MAP_DEFAULT_CENTER.lat,
      SEARCH_MAP_DEFAULT_CENTER.lng,
    );
    const options = { center, level: 5 };

    kakaoMap = new kakao.maps.Map(container, options);
    placesService = new kakao.maps.services.Places();
    bindSearchMapResize();
    bindSearchMapLifecycle();

    if (kakao.maps.event && kakao.maps.event.addListener) {
      kakao.maps.event.addListener(kakaoMap, "tilesloaded", () => {
        relayoutSearchMapSoon();
      });
    }

    statusEl.textContent =
      "지도를 불러오는 중… 위치를 확인하면 주변 병원으로 맞춥니다.";

    searchHospitalsKeyword("동물병원", { localOnly: true });
    relayoutSearchMapSoon();
    [50, 200, 500].forEach((ms) => {
      setTimeout(() => kakaoMap && kakaoMap.relayout(), ms);
    });

    /* 페이지 진입마다 GPS 시도(세션 캐시만 쓰면 권한 켠 뒤에도 좌표가 안 바뀌는 문제 방지). maximumAge:0으로 캐시된 기기 좌표도 새로 요청 */
    getUserCoordsOrDefault({
      preferSessionCache: false,
      maximumAge: 0,
    }).then((coords) => {
      if (!kakaoMap || !placesService) return;
      const ll = new kakao.maps.LatLng(coords.lat, coords.lng);
      kakaoMap.setCenter(ll);
      kakaoMap.setLevel(5);
      const q = normalizeHospitalQuery(
        document.getElementById("hospital-search-input").value,
      );
      /* setCenter 직후 getCenter()는 아직 이전 좌표일 수 있어, 검색 기준점을 ll로 고정 */
      searchHospitalsKeyword(q || "동물병원", { localOnly: true, nearLatLng: ll });
      relayoutSearchMapSoon();
      if (coords._from === "gps") {
        statusEl.textContent = "";
      } else {
        statusEl.textContent =
          "위치를 가져오지 못했습니다. 아래 검색으로 지역·병원명을 입력하거나, 오른쪽 버튼으로 다시 시도해 보세요.";
      }
    });

    const locateBtn = document.getElementById("btn-search-locate");
    if (locateBtn && !locateBtn.dataset.bound) {
      locateBtn.dataset.bound = "1";
      locateBtn.addEventListener("click", async () => {
        if (!kakaoMap || !placesService) return;
        const c = await getUserCoordsOrDefault({ forceFresh: true });
        const ll = new kakao.maps.LatLng(c.lat, c.lng);
        kakaoMap.setCenter(ll);
        kakaoMap.setLevel(5);
        const q = normalizeHospitalQuery(
          document.getElementById("hospital-search-input").value,
        );
        searchHospitalsKeyword(q || "동물병원", {
          localOnly: true,
          nearLatLng: ll,
        });
        relayoutSearchMapSoon();
        const st = document.getElementById("map-status");
        if (st) {
          st.textContent =
            c._from === "gps"
              ? ""
              : "위치를 가져오지 못했습니다. 브라우저에서 이 사이트의 위치 권한을 확인해 주세요.";
        }
      });
    }

    mapInitialized = true;
  } catch {
    showMapFallback(
      "카카오맵을 불러오지 못했습니다. API 키와 도메인 등록을 확인하세요.",
    );
    statusEl.textContent = "";
    renderHospitalList([]);
    mapInitialized = true;
  }
}

/* =============================================================================
 * [기능] 키워드 병원 검색
 * 카카오 Places API로 실시간 검색합니다.
 *
 * @param {string} keyword - 검색어 (예: "강남 동물병원", "24시")
 * @param {{ localOnly?: boolean, nearLatLng?: kakao.maps.LatLng }} [opts] - localOnly일 때 nearLatLng 없으면 getCenter() 사용(막 setCenter 직후엔 구좌표일 수 있음).
 * ============================================================================= */
function searchHospitalsKeyword(keyword, opts = {}) {
  if (!placesService || !kakaoMap) return;

  hospitalSearchSeq += 1;
  const seq = hospitalSearchSeq;

  const localOnly = opts.localOnly === true;
  let anchor = opts.nearLatLng;
  if (anchor && !(anchor instanceof kakao.maps.LatLng)) {
    anchor = new kakao.maps.LatLng(anchor.lat, anchor.lng);
  }
  /** HP8: 병원 — 세무회계 등 다른 업종이 키워드에 섞여 나오는 것을 줄임 */
  const placeOpts = { category_group_code: "HP8" };
  if (localOnly) {
    placeOpts.location = anchor || kakaoMap.getCenter();
    placeOpts.radius = 12000;
  }

  function keywordSearchCallback(data, status) {
    if (seq !== hospitalSearchSeq) return;

    // 검색 실패 또는 결과 없음
    if (
      status === kakao.maps.services.Status.ZERO_RESULT ||
      status !== kakao.maps.services.Status.OK ||
      !data.length
    ) {
      clearMarkers();
      renderHospitalList([]);
      return;
    }

    // 카카오 API 결과를 내부 데이터 형식으로 변환
    const mapped = data.map((p, i) => ({
      id: p.id || `kakao-${i}`,
      place_name: p.place_name,
      address_name: p.address_name,
      road_address_name: p.road_address_name,
      phone: p.phone,
      x: p.x,
      y: p.y,
      tags: ["all", "open"], // 실제 태그는 API에 없어 기본값으로 설정
    }));

    // 이전 마커 제거 후 새 마커 표시
    clearMarkers();
    const bounds = new kakao.maps.LatLngBounds();

    mapped.forEach((h) => {
      const pos = new kakao.maps.LatLng(parseFloat(h.y), parseFloat(h.x));
      bounds.extend(pos);
      const m = new kakao.maps.Marker({ map: kakaoMap, position: pos });
      mapMarkers.push(m);
      kakao.maps.event.addListener(m, "click", () => {
        if (!searchInfoWindow) {
          searchInfoWindow = new kakao.maps.InfoWindow({ removable: true });
        }
        searchInfoWindow.setContent(searchInfoWindowHtml(h));
        searchInfoWindow.open(kakaoMap, m);
      });
    });

    if (mapped.length) kakaoMap.setBounds(bounds);
    relayoutSearchMapSoon();

    renderHospitalList(mapped);
  }

  const kw = (keyword || "").trim() || "동물병원";
  placesService.keywordSearch(kw, keywordSearchCallback, placeOpts);
}

/* =============================================================================
 * [유틸] 검색어 정규화
 * - 지역만 입력해도 항상 "동물병원" 검색이 되도록 보정합니다.
 * ============================================================================= */
function normalizeHospitalQuery(q) {
  const s = (q || "").trim();
  if (!s) return "동물병원";
  return s.includes("동물병원") ? s : `${s} 동물병원`;
}

/* =============================================================================
 * [기능] 지도 마커 전체 제거
 * setMap(null)로 지도에서 마커를 제거하고 배열을 비웁니다.
 * ============================================================================= */
function clearMarkers() {
  mapMarkers.forEach((m) => m.setMap(null));
  mapMarkers = [];
  if (searchInfoWindow) {
    searchInfoWindow.close();
    searchInfoWindow = null;
  }
}

/* =============================================================================
 * [UI] 병원 카드 목록 렌더링
 * 검색 결과를 #hospital-list에 카드 형태로 HTML을 생성해 삽입합니다.
 * XSS 방지를 위해 사용자·API 데이터는 escapeHtml()로 처리합니다.
 *
 * 데이터 전달 방식:
 * - 병원 객체를 JSON → URI 인코딩해 data-place 속성에 저장합니다.
 * - 클릭 시 디코딩 → 파싱해 openBookModal()에 전달합니다.
 *   (클로저로 직접 전달하면 대용량 DOM 이벤트 누수 위험이 있어 이 방식을 사용)
 * ============================================================================= */
function renderHospitalList(hospitals) {
  const wrap = document.getElementById("hospital-list");

  if (!hospitals.length) {
    wrap.innerHTML = `<div class="empty-state">검색 결과가 없습니다.</div>`;
    return;
  }

  wrap.innerHTML = hospitals
    .map(
      (h) => `
    <article class="hospital-card">
      <h4>${escapeHtml(h.place_name)}</h4>
      <p class="addr">${escapeHtml(h.road_address_name || h.address_name || "")}</p>
      <div class="hospital-card__actions">
        <button
          type="button"
          class="btn-small btn-small--fill btn-book"
          data-place='${encodeURIComponent(JSON.stringify(h))}'>예약하기</button>
        <button
          type="button"
          class="btn-small btn-small--outline btn-detail"
          data-place='${encodeURIComponent(JSON.stringify(h))}'>상세보기</button>
      </div>
    </article>`,
    )
    .join("");

  // 예약하기 버튼: data-place 속성을 읽어 예약 모달 열기
  wrap.querySelectorAll(".btn-book").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = decodeURIComponent(btn.getAttribute("data-place"));
      openBookModal(JSON.parse(raw));
    });
  });

  wrap.querySelectorAll(".btn-detail").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.getAttribute("data-place");
      if (!raw) return;
      openHospitalDetailModal(JSON.parse(decodeURIComponent(raw)));
    });
  });
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

/* =============================================================================
 * [기능] 예약 모달 열기 / 닫기
 * 선택한 병원 정보를 hidden input에 미리 채운 뒤 모달을 엽니다.
 * hidden input을 통해 form submit 시 병원 정보가 함께 전송됩니다.
 * ============================================================================= */

/**
 * @param {Object} h - 병원 객체 (place_name, address_name, phone, x, y 등)
 */
function openBookModal(h) {
  // hidden input에 선택한 병원 정보를 채움
  document.getElementById("book-place-id").value = h.id || "";
  document.getElementById("book-place-name").value = h.place_name || "";
  document.getElementById("book-place-address").value =
    h.road_address_name || h.address_name || "";
  document.getElementById("book-place-phone").value = h.phone || "";
  document.getElementById("book-place-y").value = h.y || "";
  document.getElementById("book-place-x").value = h.x || "";

  // 예약 일시 기본값: 현재 시간 (로컬 타임존 보정)
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById("book-datetime").value = now
    .toISOString()
    .slice(0, 16);

  // 첫 번째 반려동물 이름을 자동으로 채움
  const user = getCurrentUser();
  const firstPet = user && user.pets && user.pets[0];
  const petNameEl = document.getElementById("book-pet-name");
  if (petNameEl) petNameEl.value = firstPet ? firstPet.name : "";

  // 모달 상단에 선택한 병원 정보 표시
  document.getElementById("modal-book-body").innerHTML = `
    <p style="margin:0 0 12px;font-size:0.9rem;color:var(--color-text-muted)">
      <strong>${escapeHtml(h.place_name)}</strong><br/>
      ${escapeHtml(h.road_address_name || h.address_name || "")}
    </p>`;

  setBookingDatetimeMinNow();
  setBookPhoneErrorVisible(false);
  document.getElementById("modal-book").classList.add("is-open");
}

/** 예약 모달을 닫습니다. */
function closeBookModal() {
  document.getElementById("modal-book").classList.remove("is-open");
}
/* =============================================================================
 * search.html — 페이지 초기화 (인라인 스크립트 통합)
 * ============================================================================= */
(function authCheckSearch() {
  ensureUsersStorage();
  if (!getSession() || !getCurrentUser()) {
    window.location.href = "index.html";
  }
})();

(async () => {
  await ensureSecretsLoaded();
  await initMapOnce();
})();

const searchInput = document.getElementById("hospital-search-input");

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchHospitalsKeyword(normalizeHospitalQuery(e.target.value));
  }
});

searchInput.addEventListener(
  "input",
  debounce((e) => {
    if (e.target.value.trim().length >= 2) {
      searchHospitalsKeyword(normalizeHospitalQuery(e.target.value));
    }
  }, 400),
);

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document
      .querySelectorAll(".chip")
      .forEach((c) => c.classList.remove("is-active"));
    chip.classList.add("is-active");
    activeFilter = chip.dataset.filter;

    const q = searchInput.value.trim();
    if (hasKakaoKey() && placesService) {
      searchHospitalsKeyword(normalizeHospitalQuery(q));
    }
  });
});

document
  .getElementById("modal-hospital-detail-close")
  .addEventListener("click", closeHospitalDetailModal);
document
  .getElementById("modal-hospital-detail-x")
  .addEventListener("click", closeHospitalDetailModal);
document
  .getElementById("modal-hospital-detail")
  .addEventListener("click", (e) => {
    if (e.target.id === "modal-hospital-detail") closeHospitalDetailModal();
  });

document
  .getElementById("modal-book-close")
  .addEventListener("click", closeBookModal);
document.getElementById("modal-book").addEventListener("click", (e) => {
  if (e.target.id === "modal-book") closeBookModal();
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
    petName:
      (document.getElementById("book-pet-name")?.value || "").trim() ||
      "반려동물",
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
  closeBookModal();
  alert("예약이 저장되었습니다.");
});

document.getElementById("book-phone").addEventListener("input", () => {
  if (isValidBookPhone(document.getElementById("book-phone").value)) {
    setBookPhoneErrorVisible(false);
  }
});

document.getElementById("btn-dummy-noti").addEventListener("click", () => {
  alert("알림이 없습니다.");
});
