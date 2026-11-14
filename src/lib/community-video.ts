/**
 * 짧은 영상 — 저장소 이름·한도와 공개 파일 지우기 (서버·화면 둘 다 쓰는 값은 VIDEO_* 만).
 * 흐름: 휴대폰 → 비공개 버킷(RAW)에 서명 주소로 바로 올림 → 서버가 위치·기기 정보 없이 새 파일로 다시 만듦 → 공개 버킷 → 원본 지움
 */
export const VIDEO_RAW_BUCKET = "community-video-raw";
export const VIDEO_BUCKET = "community-video";
/** 올릴 수 있는 원본 크기 (저장소 한도와 같게) */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
/** 영상 길이 한도(초) */
export const VIDEO_MAX_SECONDS = 30;
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

export function videoPrefix() {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${VIDEO_BUCKET}/`;
}

/** 우리 공개 영상 주소 → 버킷 안 경로 */
export function videoPaths(urls: (string | null | undefined)[]) {
  const prefix = videoPrefix();
  return urls.filter((u): u is string => typeof u === "string" && u.startsWith(prefix) && !u.includes(".."))
    .map((u) => decodeURIComponent(u.slice(prefix.length)));
}

/** 공개 영상 파일 지우기 — 실패해도 글 지우기는 막지 않고 오류를 돌려준다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function removeVideos(sb: any, urls: (string | null | undefined)[]): Promise<string | null> {
  const paths = videoPaths(urls);
  if (!paths.length) return null;
  const { error } = await sb.storage.from(VIDEO_BUCKET).remove(paths);
  return error ? error.message : null;
}

/** 이 사람이 올린 공개 영상인지 (글에 붙이기 전 확인) */
export function ownVideo(url: unknown, actor: string): url is string {
  return typeof url === "string" && url.startsWith(`${videoPrefix()}${actor}/`) && !url.includes("..") && url.endsWith(".mp4");
}
