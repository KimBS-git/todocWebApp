/**
 * mypage.js — 마이페이지
 * 의존: common.js (CONFIG, 스토리지, 인증)
 */

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
