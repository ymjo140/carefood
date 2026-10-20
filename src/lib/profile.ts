import type { OnboardingProfile } from "@/types/database";

const STORAGE_KEY = "carefood_profile";

/**
 * localStorage에서 프로필 로드
 * 비로그인/로그인 공통으로 사용
 */
export function loadLocalProfile(): OnboardingProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingProfile;
  } catch {
    return null;
  }
}

/**
 * localStorage에 프로필 저장
 */
export function saveLocalProfile(profile: OnboardingProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* silent — Safari 프라이빗 모드 등 */
  }
}

/**
 * localStorage 프로필 삭제
 */
export function clearLocalProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}
