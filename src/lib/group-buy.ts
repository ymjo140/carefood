/**
 * 공구 — 화면과 API 가 같이 쓰는 값.
 * 진행자가 사진·먹어 본 이야기와 함께 공구를 만들고, 관심이 모이면(GROUP_TARGET) 판매처에 공구를 요청한다.
 * 판매를 열기 전(GROUP_BUY_ENABLED 꺼짐)엔 관심만 모은다 — 가격·증정은 '바라는 것'이지 약속이 아니다.
 */

/** 관심이 이만큼 모이면 판매처에 공구를 요청한다 (진행자가 고르지 않음) */
export const GROUP_TARGET = 30;
/** 관심을 모으는 기간(일) */
export const GROUP_DAYS = 14;
/** 사진 수 · 이야기 길이 */
export const GROUP_MAX_PHOTOS = 4;
export const GROUP_STORY_MAX = 80;

/** 한 사람이 살 묶음(팩 수) */
export const PACK_OPTIONS = [
  { value: 5, label: "5팩" },
  { value: 10, label: "10팩" },
  { value: 30, label: "한 달 치 30팩" },
] as const;

/** 바라는 것 — 여러 개 고른다 */
export const WISHES = {
  off10: "10% 할인",
  off20: "20% 할인",
  plus1: "1팩 더",
  free_ship: "배송비 무료",
} as const;
export type Wish = keyof typeof WISHES;
export const isWish = (v: unknown): v is Wish => typeof v === "string" && v in WISHES;

/** "20% 할인 또는 1팩 더" */
export function wishLabel(wishes: string[] | null | undefined) {
  const list = (wishes || []).filter(isWish).map((w) => WISHES[w]);
  return list.length ? list.join(" 또는 ") : null;
}

/** 관심 표시 버튼·알림 문구 — 판매가 열리기 전엔 '열리면 알림 받기' (관심 표시한 사람에게 판매가 열리면 알린다) */
export function groupBuyWords(open: boolean) {
  return open
    ? { mark: "참여하기", marked: "참여했어요", done: "참여했어요", undo: "참여를 취소했어요", fail: "참여하지 못했어요", undoFail: "참여를 취소하지 못했어요" }
    : { mark: "열리면 알림 받기", marked: "알림 받는 중", done: "판매가 열리면 알려 드려요", undo: "알림을 껐어요", fail: "알림을 켜지 못했어요", undoFail: "알림을 끄지 못했어요" };
}
