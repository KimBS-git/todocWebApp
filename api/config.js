/**
 * Vercel Serverless Function
 * - 환경변수로 주입된 비밀키를 프론트에 전달합니다.
 *
 * 설정 방법(Vercel):
 * - Project Settings → Environment Variables
 * - KAKAO_APP_KEY = (카카오 JavaScript 키)
 *
 * 주의:
 * - 카카오 JavaScript 키는 어차피 브라우저에서 사용되므로 완전 비공개는 불가합니다.
 * - 대신 카카오 개발자 콘솔의 "플랫폼(Web) → 사이트 도메인" 제한으로 보호하세요.
 */
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  res.status(200).json({
    KAKAO_APP_KEY: process.env.KAKAO_APP_KEY || "",
  });
}

