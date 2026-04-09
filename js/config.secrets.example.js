/**
 * 비밀 설정 예시 (이 파일은 GitHub에 올려도 됩니다)
 *
 * 실제 API 키를 넣으려면:
 *   1) 이 파일을 복사:  cp js/config.secrets.example.js js/config.secrets.js
 *   2) js/config.secrets.js 를 열고 KAKAO_APP_KEY 에 JavaScript 키를 입력
 *   3) config.secrets.js 는 .gitignore 에 있어 커밋되지 않습니다.
 *
 * search.html 은 config.secrets.example.js 다음에 config.secrets.js 를 로드합니다.
 * config.secrets.js 가 없으면(복사 전) 이 예시의 빈 문자열만 적용됩니다.
 */
window.TODOC_SECRETS = {
  /** 카카오맵 JavaScript 키 (https://developers.kakao.com) */
  KAKAO_APP_KEY: "",
};
