/**
 * 이 기기 프로필 ↔ 서버 프로필 맞추기 (DB·브라우저 없이 계산만, 시험: tests/profile-sync.test.ts). 부르는 곳: components/SessionSync.tsx.
 *
 * 왜 필요한가 (11/15 확인): 온보딩·내 정보 고치기는 프로필을 이 기기(localStorage)와 서버(user_profiles)에 같이 저장하는데,
 *  - 서버가 건강 목표(goals)를 저장하기 시작한 것은 11/14 부터라 그 전에 온보딩한 사람은 서버 goals 가 비어 있었다(null).
 *  - 온보딩 때 기록 주인 쿠키가 아직 없으면 서버 저장을 건너뛰었다("다음 방문 때 서버에 맞춘다" — 맞추는 코드가 없었다).
 *  - 홈 추천은 이 기기 프로필을 보내서 문제가 안 보였지만, 서버에서 프로필을 읽는 곳(캐릭터 대화 추천·업체 고객층)은 목표를 못 봤다.
 * 규칙:
 *  - 서버에 프로필이 없으면 → 이 기기 것을 통째로 올린다 (full).
 *  - 서버 goals 가 비어 있으면(null = 저장한 적 없음) → 이 기기 목표만 채운다 (fill_goals, 서버는 비어 있을 때만 쓴다 — 다른 기기의 새 값을 덮지 않게).
 *  - 이 기기에서 나중에 저장했는데(saved_at) 서버가 그보다 옛것이면 → 통째로 올린다 (full). 서버가 더 새것이면 그대로 둔다.
 *  - 그 밖에는 아무것도 하지 않는다.
 */
export const ALL_GOALS = ["balanced", "weight_loss", "muscle", "gut_health", "skin", "energy", "diabetes", "blood_pressure", "kidney"] as const;
export const DISEASE_GOAL_KEYS = ["diabetes", "blood_pressure", "kidney"];

/** 알려진 목표만, 겹치지 않게, 10개까지 */
export function cleanGoals(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((g): g is string => typeof g === "string" && (ALL_GOALS as readonly string[]).includes(g)))].slice(0, 10);
}

type Local = { goals?: unknown; saved_at?: unknown } | null;
type Server = { goals?: unknown; updated_at?: unknown } | null;

export type SyncAction = "none" | "full" | "fill_goals";

export function profileSyncAction(local: Local, server: Server, hasServerRow: boolean): SyncAction {
  if (!local || !Array.isArray(local.goals)) return "none"; // 이 기기에 온보딩 결과가 없다
  if (!hasServerRow) return "full";
  const localAt = typeof local.saved_at === "string" ? Date.parse(local.saved_at) : NaN;
  const serverAt = typeof server?.updated_at === "string" ? Date.parse(server.updated_at) : NaN;
  // 1초 넘게 이 기기가 새것일 때만 (같은 저장이 시계 차이로 두 번 올라가지 않게)
  if (Number.isFinite(localAt) && Number.isFinite(serverAt) && localAt - serverAt > 1000) return "full";
  if (server?.goals == null && cleanGoals(local.goals).length) return "fill_goals";
  return "none";
}
