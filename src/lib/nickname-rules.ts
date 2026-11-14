/**
 * 커뮤니티 이름 규칙 — 브라우저(lib/nickname.ts)와 서버(lib/community-profile.ts)가 같이 쓴다.
 *   2~12자 · 한글·영문·숫자·밑줄 · 서비스·운영자로 보일 이름은 못 쓴다
 */
const ADJ = ["건강한", "활기찬", "든든한", "상쾌한", "깔끔한", "씩씩한", "발랄한", "포근한", "산뜻한", "튼튼한"];
const ANIMAL = ["사자", "호랑이", "토끼", "곰", "여우", "다람쥐", "펭귄", "고래", "부엉이", "사슴"];

export function makeNickname() {
  return `${ADJ[Math.floor(Math.random() * ADJ.length)]}${ANIMAL[Math.floor(Math.random() * ANIMAL.length)]}${Math.floor(Math.random() * 100)}`;
}

const RESERVED = /오늘끼록|끼록|케어푸드|carefood|kkirok|운영|관리자|관리팀|admin|공식|매니저|manager|staff|스태프|고객센터|상담원|익명/i;

/** 문제가 없으면 null, 있으면 사용자에게 보일 이유 */
export function nicknameProblem(v: string): string | null {
  const s = v.trim();
  if (!/^[가-힣a-zA-Z0-9_]{2,12}$/.test(s)) return "2~12자의 한글·영문·숫자·밑줄만 쓸 수 있어요";
  if (RESERVED.test(s)) return "서비스나 운영자로 보일 수 있는 이름은 쓸 수 없어요";
  return null;
}

export function validNickname(v: string) {
  return nicknameProblem(v) === null;
}
