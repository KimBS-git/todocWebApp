# 토닥 (Todoc)

반려동물을 위한 동물병원 예약 모바일 앱인 토닥의 웹 애플리케이션 버전입니다.

---

## 배포

[todoc_web](https://todocwebapp.vercel.app/)

---

## 1. 프로젝트 구조

```
todoc_web_app/
├── api/
│   └── config.js          # Vercel Serverless: KAKAO_APP_KEY JSON 응답
├── css/
│   ├── common.css         # 공통 레이아웃·네비·토큰
│   ├── index.css          # 홈 전용
│   ├── search.css         # 병원검색 전용
│   ├── book.css           # 예약내역 전용
│   └── mypage.css         # 마이페이지 전용
├── html/
│   ├── index.html         # 홈(로그인/회원가입 + 대시보드)
│   ├── search.html        # 병원검색(카카오맵)
│   ├── book.html          # 예약내역
│   └── mypage.html        # 마이페이지
├── js/
│   ├── common.js          # 카카오 설정 로드, 스토리지, 로그인/회원가입, 기본 admin 시드
│   ├── index.js           # 홈 렌더링(예약·반려동물 카드), 로그인 부트스트랩
│   ├── search.js          # 병원검색·지도·예약 모달
│   ├── book.js            # 예약내역 탭·카드·후기
│   ├── mypage.js          # 프로필·반려동물·로그아웃
│   └── app.js             # (참고) SPA 안내용, HTML에서 미사용
├── images/                # 로고 등 정적 이미지 (예: todoc_logo.png)
├── vercel.json            # rewrites/redirects, search.js 캐시 헤더
└── README.md
```

페이지별로 **HTML + 해당 CSS + 해당 JS** 한 세트로 동작하며, `common.js`는 인증·스토리지·카카오 키 로드를 위해 여러 페이지에서 공통으로 먼저 로드합니다.

---

## 2. 페이지별 주요 기능

### 홈 (`html/index.html` + `js/index.js`)

**역할:** 비로그인 시 로그인/회원가입, 로그인 후 홈 대시보드.

- **가상 지도 영역:** CSS로 맵 느낌의 장식 블록(실제 카카오 지도 API 없음).
- **「지도에서 병원 찾기」:** `search.html`로 이동하는 CTA.
- **빠른 서비스:** 미용·호텔·동물카페·용품샵 4항목, 가로 한 줄·정사각형 타일.
- **다가오는 예약 / 이전 예약** 요약 카드.
- **나의 반려동물:** 마이페이지와 동일 `user.pets` 데이터를 카드로 가로 스크롤, **전체보기**는 `mypage.html`.

세션이 있으면 인증 화면을 숨기고 `renderHome()`만 호출합니다(홈에는 카카오맵 초기화 코드 없음).

```266:274:js/index.js
(function bootIndex() {
  ensureUsersStorage();

  if (getSession() && getCurrentUser()) {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");
    renderHome();
  }
})();
```

`renderHome()`은 예약 요약 후 `renderHomePetsBlock(user)`로 하단 반려동물 영역을 채웁니다.

```150:226:js/index.js
function renderHome() {
  const user = getCurrentUser();
  if (!user) return;

  const { upcoming, past } = splitReservationsByTime(user.reservations || []);

  /* ─── 다가오는 예약 카드 ──────────────────────────────────────
     예정된 예약 중 가장 가까운 것 하나를 강조 카드로 표시합니다.
     예약이 없으면 "예정된 예약이 없습니다." 메시지를 표시합니다. */
  const upcomingWrap = document.getElementById("home-upcoming-wrap");
  // ... 이전 예약 미니 카드 ...

  renderHomePetsBlock(user);
}
```

---

### 병원검색 (`html/search.html` + `js/search.js`)

**역할:** 카카오맵 SDK 동적 로드, 위치 기반 Places 키워드 검색, 목록·마커·예약 모달.

```276:298:js/search.js
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
```

```526:527:js/search.js
function searchHospitalsKeyword(keyword) {
  if (!placesService || !kakaoMap) return;
```

---

### 예약내역 (`html/book.html` + `js/book.js`)

**역할:** 「예정된 예약」/「지난 예약」 탭, 카드 목록, 상세·취소·후기·재예약 등.

```28:45:js/book.js
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
```

`?tab=past` 쿼리로 들어오면 지난 예약 탭을 자동 선택합니다.

```369:371:js/book.js
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "past") {
    document.querySelector('.res-tab[data-res-tab="past"]')?.click();
```

---

### 마이페이지 (`html/mypage.html` + `js/mypage.js`)

**역할:** 프로필 표시, 반려동물 목록(추가·수정·삭제), 프로필 수정 모달, 로그아웃.

`#mypage-content`에 `innerHTML`로 전체를 그린 뒤 버튼 이벤트를 다시 바인딩합니다.

```24:71:js/mypage.js
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
```

---

### 공통 (`js/common.js`)

**역할:** `/api/config`로 카카오 앱 키 주입, `localStorage` 기반 사용자·세션, 로그인/회원가입, **기본 `admin` 계정 시드**(없을 때만 `admin` / `admin` + 지난 예약 데모 1건).

```61:75:js/common.js
/** admin 계정이 없을 때만 비밀번호 admin으로 생성 + 지난 예약 데모 1건 */
function ensureDefaultAdminAccount() {
  const users = loadUsers();
  if (!users || users[DEFAULT_ADMIN_ID]) return;

  users[DEFAULT_ADMIN_ID] = {
    password: DEFAULT_ADMIN_PASSWORD,
    isAdmin: true,
    displayName: "관리자",
    phone: "",
    pets: [],
    reservations: [createAdminPastDemoReservation()],
  };
  saveUsers(users);
}
```

```109:112:js/common.js
function ensureUsersStorage() {
  if (!loadUsers()) saveUsers({});
  ensureDefaultAdminAccount();
}
```

```123:136:js/common.js
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
```

---

### 배포 API (`api/config.js`)

**역할:** Vercel 환경변수 `KAKAO_APP_KEY`를 JSON으로 내려주어 브라우저에서 카카오맵 초기화에 사용합니다.

```13:19:api/config.js
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  res.status(200).json({
    KAKAO_APP_KEY: process.env.KAKAO_APP_KEY || "",
  });
}
```

---

## 3. 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| 마크업·스타일 | HTML5, CSS3 (페이지별 스타일시트 분리) |
| 스크립트 | 바닐라 JavaScript (ES6+), 모듈 번들러 없음 |
| 라우팅 | MPA — 페이지마다 별도 HTML, 링크로 이동 |
| 데이터 저장 | `localStorage`(사용자·세션·예약·반려동물), `sessionStorage`(검색 페이지 위치 캐시 등) |
| 지도·장소 | 카카오맵 JavaScript API, Places, `navigator.geolocation` |
| 폰트 | Pretendard (jsDelivr CDN) |
| 배포·백엔드 | Vercel Serverless Functions (`/api/config`), `vercel.json`(rewrites·redirects·캐시 헤더) |


