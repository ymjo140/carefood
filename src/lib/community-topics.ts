/**
 * 커뮤니티 모임 — 글을 올릴 때 고르는 주제. 글의 tags 첫 칸에 이름 그대로 들어간다.
 * 작성자의 건강 관심사(민감정보)를 글에 붙이는 대신, 글마다 본인이 고른 모임으로 묶는다.
 * 질환 이름이나 효능 표현은 쓰지 않는다.
 */
export const COMMUNITY_TOPICS = ["저염 식단", "고단백", "다이어트", "도시락", "당 줄이기", "채식", "장 편한 식단"] as const;
export type CommunityTopic = (typeof COMMUNITY_TOPICS)[number];

export function isTopic(v: unknown): v is CommunityTopic {
  return typeof v === "string" && (COMMUNITY_TOPICS as readonly string[]).includes(v);
}
