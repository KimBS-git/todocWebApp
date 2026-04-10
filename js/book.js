/**
 * book.js — 예약내역 페이지
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
