/**
 * app.js — (참고용) 과거 SPA 구조 안내
 *
 * ⚠️ 이 파일은 어떤 HTML에서도 로드하지 않습니다.
 *
 * 현재 프로젝트는 MPA(페이지별 HTML)이며, JS/CSS는 페이지당 하나의 번들로 통합되어 있습니다.
 *
 * | HTML        | CSS            | JS            |
 * |-------------|----------------|---------------|
 * | index.html  | css/index.css  | js/index.js   |
 * | search.html | css/search.css | js/search.js (+ config.secrets) |
 * | book.html   | css/book.css   | js/book.js    |
 * | mypage.html | css/mypage.css | js/mypage.js  |
 *
 * API 키 등: js/config.secrets.example.js 를 복사해 js/config.secrets.js 로 두고 수정 (Git 제외, .gitignore)
 */
