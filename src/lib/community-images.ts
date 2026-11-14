/**
 * 커뮤니티 사진 파일 — 서버에서만 쓴다.
 * 글을 지우거나 관리자가 내리면 저장소의 사진 파일도 같이 지운다 (남겨 두지 않음).
 */
export const IMAGE_BUCKET = "community";

export function imagePrefix() {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/`;
}

/** 우리 저장소 주소만 → 버킷 안 경로 */
export function imagePaths(urls: (string | null | undefined)[]) {
  const prefix = imagePrefix();
  return urls.filter((u): u is string => typeof u === "string" && u.startsWith(prefix) && !u.includes(".."))
    .map((u) => decodeURIComponent(u.slice(prefix.length)));
}

/**
 * 사진 파일 지우기 — 실패해도 글 지우기는 막지 않고 오류를 돌려준다.
 * owner 를 주면 그 사람 폴더(<owner>/…)의 파일만 지운다 — 남의 사진 주소를 붙인 글을 지워도 원래 사진은 남는다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function removeImages(sb: any, urls: (string | null | undefined)[], owner?: string | null): Promise<string | null> {
  const paths = imagePaths(urls).filter((path) => owner === undefined || (!!owner && path.startsWith(`${owner}/`)));
  if (!paths.length) return null;
  const { error } = await sb.storage.from(IMAGE_BUCKET).remove(paths);
  return error ? error.message : null;
}
