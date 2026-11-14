/**
 * 파일 내려받기 (화면용) — 링크로 바로 받으면 서버 오류가 JSON 화면으로 떠 버린다.
 * 받아서 저장하고, 실패하면 서버가 준 이유를 던진다 (부르는 쪽이 알림으로 보여 준다)
 */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const r = await fetch(url);
  if (!r.ok) {
    const d = await r.json().catch(() => null);
    throw new Error(d?.error || "내려받지 못했어요");
  }
  const blob = await r.blob();
  const cd = r.headers.get("Content-Disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
