"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon, ShareCardPreview, ShareSteps, Sheet, Switch, Tabs, useToast } from "@/components/ui";
import { hasPhoto, renderCard, type CardData, type CardStyle } from "@/lib/share-card";

/**
 * 인증 카드 만들기 — 내 식단·챌린지·공구를 9:16 카드로 그려 인스타 스토리에 올린다.
 * 모양: 사진(내 사진 + 스티커) · 스티커만(투명, 내 사진 위에 붙이기) · 기록(큰 숫자)
 * 인스타에 공유하기: 공유 링크(/s/<code>)를 복사해 두고 휴대폰 공유 창을 연다 → 인스타그램 → 스토리 → 링크 스티커에 붙여 넣기
 * 공유 창이 없는 브라우저(컴퓨터 등)는 그림을 저장한다.
 * 공유 링크: 카드를 다 그리면 그 그림과 함께 미리 만든다(공유 창은 누른 순간에만 열려 그때 서버를 기다릴 수 없다).
 *   모양을 바꾸면 같은 링크의 그림만 바꾼다. 실제로 공유·저장·복사를 눌렀을 때만 '공유함'으로 센다.
 *   챌린지 카드의 링크는 내 묶음 초대 화면(/j/<code>)으로 간다.
 */
/** day 의 id 는 날짜(YYYY-MM-DD) */
export type ShareTarget = { kind: "meal" | "challenge" | "group_buy" | "day" | "streak"; id: string };

const STYLE_LABEL: Record<CardStyle, string> = { photo: "사진", sticker: "스티커만", record: "기록" };

export default function ShareCardSheet({ target, open, onClose }: { target: ShareTarget | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<{ status: "loading" | "error" | "done"; card: CardData | null; error?: string }>({ status: "loading", card: null });
  const [attempt, setAttempt] = useState(0);
  const [style, setStyle] = useState<CardStyle>("photo");
  const [showKcal, setShowKcal] = useState(false);
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<{ status: "idle" | "making" | "ready" | "error"; code?: string; error?: string }>({ status: "idle" });
  const seq = useRef(0);
  const linkSeq = useRef(0);
  const codeRef = useRef<string | null>(null);

  // 카드에 그릴 것 불러오기
  const kind = target?.kind, tid = target?.id;
  useEffect(() => {
    if (!open || !kind || !tid) return;
    let alive = true;
    setData({ status: "loading", card: null });  
    setShare({ status: "idle" });
    codeRef.current = null;
    fetch(`/api/community/share-card?kind=${kind}&id=${tid}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "");
        if (!alive) return;
        setData({ status: "done", card: d.card });
        setStyle(hasPhoto(d.card) ? "photo" : "record");
      })
      .catch((e) => { if (alive) setData({ status: "error", card: null, error: (e as Error).message || undefined }); });
    return () => { alive = false; };
  }, [open, kind, tid, attempt]);

  // 모양·열량을 바꿀 때마다 다시 그린다 (마지막으로 그린 것만 남긴다)
  useEffect(() => {
    if (data.status !== "done" || !data.card) return;
    const n = ++seq.current;
    setImg(null);  
    setDrawError(null);
    renderCard(data.card, { style, showKcal, site: window.location.host })
      .then((blob) => { if (n === seq.current) setImg({ blob, url: URL.createObjectURL(blob) }); })
      .catch((e) => { if (n === seq.current) setDrawError((e as Error).message || "카드를 만들지 못했어요"); });
  }, [data, style, showKcal]);

  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url); }, [img]);

  // 그린 카드로 공유 링크 만들기·바꾸기 (마지막 그림만 남긴다)
  useEffect(() => {
    if (!img || !kind || !tid) return;
    const n = ++linkSeq.current;
    const t = setTimeout(async () => {
      setShare((s) => ({ ...s, status: s.code ? "ready" : "making" }));
      try {
        const image = await new Promise<string>((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = () => reject(new Error("카드 그림을 읽지 못했어요")); fr.readAsDataURL(img.blob); });
        const r = await fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id: tid, image, code: codeRef.current }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "");
        if (n !== linkSeq.current) return;
        codeRef.current = d.code;
        setShare({ status: "ready", code: d.code });
      } catch (e) {
        if (n === linkSeq.current) setShare((s) => (s.code ? s : { status: "error", error: (e as Error).message || undefined }));
      }
    }, 400);
    return () => clearTimeout(t);
  }, [img, kind, tid]);

  const card = data.card;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // 공유 링크가 없으면(만드는 중·실패) 대상 주소를 그대로 쓴다
  const link = share.code ? `${origin}/s/${share.code}` : card ? `${origin}${card.url}` : "";

  /** 공유·저장·복사를 누르면 '공유함'으로 표시 (세기용) */
  const markShared = () => {
    if (!share.code) return;
    fetch("/api/share", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: share.code }) })
      .then((r) => { if (!r.ok) console.error("공유 표시를 남기지 못했어요", r.status); })
      .catch((e) => console.error("공유 표시를 남기지 못했어요", e)); // ds-allow: 세기는 보조 — 공유는 이미 했다
  };
  const fileName = `carefood-${card?.kind || "card"}-${style}.png`;

  const copyLink = async (quiet = false) => {
    try {
      await navigator.clipboard.writeText(link);
      markShared();
      if (!quiet) toast.show("링크를 복사했어요");
      return true;
    } catch {
      if (!quiet) toast.show("링크를 복사하지 못했어요. 게시물 주소를 직접 복사해 주세요", { tone: "danger" });
      return false;
    }
  };

  const save = () => {
    if (!img) return;
    const a = document.createElement("a");
    a.href = img.url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    markShared();
  };

  /** 공유 창 — 링크를 먼저 복사해 두고(기다리지 않음: 공유 창은 누른 순간에만 열린다) 그림 파일을 넘긴다 */
  const shareToInstagram = async () => {
    if (!img) return;
    const copied = copyLink(true);
    const file = new File([img.blob], fileName, { type: "image/png" });
    setBusy(true);
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        markShared();
        toast.show((await copied) ? "링크는 복사돼 있어요. 스토리의 링크 스티커에 붙여 넣어 주세요" : "공유했어요");
      } else {
        save();
        toast.show((await copied) ? "카드를 저장했어요. 링크는 복사돼 있어요" : "카드를 저장했어요");
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // 공유 창을 닫음
      toast.show("공유 창을 열지 못했어요. 카드 저장하기로 내려받아 올려 주세요", { tone: "danger" });
    } finally { setBusy(false); }
  };

  /** 스티커만 — 클립보드에 그림으로 (인스타 스토리 편집 화면에서 붙여 넣으면 스티커가 된다) */
  const copySticker = async () => {
    if (!img) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": img.blob })]);
      markShared();
      toast.show("스티커를 복사했어요. 인스타 스토리에서 화면을 길게 눌러 붙여 넣어 주세요");
    } catch {
      toast.show("이 브라우저는 그림 복사를 막아요. 카드 저장하기로 내려받아 주세요", { tone: "danger" });
    }
  };

  const styles: CardStyle[] = card ? (hasPhoto(card) ? ["photo", "sticker", "record"] : ["record", "sticker"]) : ["photo"];

  return (
    <Sheet open={open} onClose={onClose} title="인증 카드" description="인스타 스토리에 올릴 9:16 카드예요. 몸무게·건강 목표는 들어가지 않아요"
      footer={data.status === "done" ? (
        <div className="w-full flex flex-col gap-2">
          {style === "sticker"
            ? <Button block icon="copy" disabled={!img} onClick={copySticker}>스티커 복사하기</Button>
            : <Button block icon="share" disabled={!img} loading={busy} onClick={shareToInstagram}>인스타에 공유하기</Button>}
          <div className="flex gap-2">
            <Button block variant="secondary" icon="download" disabled={!img} onClick={save}>카드 저장하기</Button>
            <Button block variant="secondary" icon="link" onClick={() => copyLink()}>링크 복사하기</Button>
          </div>
        </div>
      ) : undefined}>
      {data.status === "loading" && <ShareCardPreview src={null} alt="" />}
      {data.status === "error" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-label text-ink">카드에 넣을 기록을 불러오지 못했어요{data.error ? ` (${data.error})` : ""}</p>
          <Button size="sm" variant="secondary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>
        </div>
      )}
      {data.status === "done" && card && (
        <div className="flex flex-col gap-4">
          <Tabs variant="line" label="카드 모양" value={style} onChange={setStyle} items={styles.map((s) => ({ value: s, label: STYLE_LABEL[s] }))} />
          {drawError
            ? <p role="alert" className="text-label text-danger">{drawError}. 다른 모양을 골라 주세요</p>
            : <ShareCardPreview src={img?.url ?? null} alt={`${STYLE_LABEL[style]} 모양 인증 카드 미리 보기`} sticker={style === "sticker"} />}
          {card.kind === "meal" && card.total && (
            <Switch checked={showKcal} onChange={setShowKcal} label="열량도 넣기" description="기본은 단백질·탄수화물·지방만 보여요" />
          )}
          <ShareSteps steps={style === "sticker"
            ? ["스티커 복사하기를 눌러요", "인스타 스토리에서 내 사진을 고르고 화면을 길게 눌러 붙여 넣어요", "링크 스티커에 게시물 링크를 붙이면 친구가 바로 볼 수 있어요"]
            : ["인스타에 공유하기 → 인스타그램 → 스토리를 골라요", "링크는 미리 복사돼요. 스티커 버튼 → 링크에 붙여 넣어요",
              card.kind === "challenge" || kind === "day" || kind === "streak" ? "친구가 링크를 누르면 같이 기록을 시작할 수 있어요" : "친구가 링크를 누르면 이 게시물이 바로 열려요"]} />
          <p className="text-caption text-ink-2 flex items-center gap-1"><Icon name="link" size={14} /><span className="min-w-0 truncate">{link}</span></p>
          {share.status === "error" && (
            <p className="text-caption text-ink-2">공유 링크를 만들지 못해 게시물 주소를 그대로 써요. 친구가 열어 본 수는 세지 않아요{share.error ? ` (${share.error})` : ""}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
