/** 클래스 이름 합치기 — false/undefined 는 건너뜀 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
