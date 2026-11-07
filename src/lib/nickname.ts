"use client";

/**
 * 커뮤니티 이름(닉네임) — 이 기기 프로필(carefood_profile.nickname)에 둔다.
 * 처음엔 '건강한사자12' 같은 이름을 지어 주고, 마이페이지에서 바꿀 수 있다.
 */
const ADJ = ["건강한", "활기찬", "든든한", "상쾌한", "깔끔한", "씩씩한", "발랄한", "포근한", "산뜻한", "튼튼한"];
const ANIMAL = ["사자", "호랑이", "토끼", "곰", "여우", "다람쥐", "펭귄", "고래", "부엉이", "사슴"];

function makeNickname() {
  return `${ADJ[Math.floor(Math.random() * ADJ.length)]}${ANIMAL[Math.floor(Math.random() * ANIMAL.length)]}${Math.floor(Math.random() * 100)}`;
}

function readProfile(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem("carefood_profile") || "{}") || {};
  } catch {
    return {}; // ds-allow: 저장소를 못 읽으면 빈 프로필
  }
}

function writeProfile(p: Record<string, unknown>) {
  try {
    localStorage.setItem("carefood_profile", JSON.stringify(p));
  } catch { /* 저장소를 못 쓰면 이번 화면에서만 쓴다 */ } // ds-allow: 이름은 다음에 다시 지어진다
}

export function getOrCreateNickname(): string {
  const p = readProfile();
  const cur = typeof p.nickname === "string" ? p.nickname.trim() : "";
  if (cur && cur !== "익명") return cur;
  const nick = makeNickname();
  writeProfile({ ...p, nickname: nick });
  return nick;
}

/** 2~12자, 글자·숫자·밑줄만 */
export function validNickname(v: string) {
  return /^[가-힣a-zA-Z0-9_]{2,12}$/.test(v.trim());
}

export function setNickname(nick: string) {
  writeProfile({ ...readProfile(), nickname: nick.trim() });
}
