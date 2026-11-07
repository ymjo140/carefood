"use client";

/** 알림을 마지막으로 본 시각 — 기기마다 따로 둔다 (새 소식 점 표시용) */
const KEY = "cf_notif_seen";

export function getNotifSeen(): number {
  try {
    return Number(localStorage.getItem(KEY) || 0);
  } catch {
    return 0; // ds-allow: 저장소를 못 읽으면 모두 새 소식으로 본다
  }
}

export function markNotifSeen(at = Date.now()) {
  try {
    localStorage.setItem(KEY, String(at));
    window.dispatchEvent(new Event("cf-notif-seen"));
  } catch { /* 저장소를 못 쓰면 점이 남는다 */ } // ds-allow: 점 표시만 남음
}
