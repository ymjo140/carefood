"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button, Chip, Field, Icon, IconButton, Input, LinkButton, ListRow, Notice, Sheet, VideoAttach, SkeletonList, Textarea, Thumb, cn, useToast,
} from "@/components/ui";
import { GROUP_DAYS, GROUP_MAX_PHOTOS, GROUP_STORY_MAX, GROUP_TARGET, parseOffer } from "@/lib/group-buy";
import { checkClaims } from "@/lib/partner/claims";
import { usePhotoUploads } from "./usePhotoUploads";
import { useVideoUpload } from "./useVideoUpload";
import { OfferEditor, draftToOffer, newOption, type OfferDraft } from "./OfferEditor";

/**
 * 공구 만들기 — 인플루언서 공구처럼 써 본 사람이 사진·이야기와 함께 연다.
 * 제품을 고르면: 내가 최근 30일 기록한 횟수(글에 '써 본 사람'으로 붙음) · 같은 제품 공구가 모집 중이면 그쪽으로.
 * 조건표(OfferEditor): 구성·희망 공구가(지금 최저 1개 값보다 낮게)·배송·증정·1인 최대·목표 인원·기간을 진행자가 숫자로 정한다.
 * 목표 인원이 모이면 판매처에 공구를 요청한다. 판매가 열리기 전엔 관심만 모은다.
 */
export type GroupBuyProduct = { id: string; name: string; manufacturer?: string | null; image_url?: string | null; product_prices?: { price: number }[] };
type Hit = { id: string; name: string; manufacturer?: string | null; image_url?: string | null; product_prices?: { price: number }[] };
type Check = {
  status: "idle" | "loading" | "error" | "done"; records: number; existing: { id: string; current_count: number } | null;
  lowest: { unit: number; checked: string | null } | null;
};
const NO_CHECK: Check = { status: "idle", records: 0, existing: null, lowest: null };
const emptyDraft = (): OfferDraft => ({ options: [], ship: "free", fee: "3000", over: "30000", gift: "none", giftN: "", giftItem: "", perMax: "", target: GROUP_TARGET, days: GROUP_DAYS });

export default function GroupBuyComposer({ open, onClose, initialProduct }: {
  open: boolean; onClose: () => void;
  /** 제품 상세에서 열면 그 제품을 고른 채로 시작 */
  initialProduct?: GroupBuyProduct | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const { photos, fileRef, pick, drop, clear, uploading, urls } = usePhotoUploads(GROUP_MAX_PHOTOS);
  const { video, status: vStatus, busy: vBusy, fileRef: vRef, pick: vPick, drop: vDrop, clear: vClear } = useVideoUpload();

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ status: "idle" | "loading" | "error" | "done"; items: Hit[] }>({ status: "idle", items: [] });
  const [picked, setPicked] = useState<Hit | null>(null);
  const [check, setCheck] = useState<Check>(NO_CHECK);
  const [draft, setDraft] = useState<OfferDraft>(emptyDraft);
  const [story, setStory] = useState("");
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 늦게 온 응답이 새 결과를 덮지 않게 — 마지막 요청만 상태를 바꾼다
  const searchSeq = useRef(0);

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits({ status: "idle", items: [] }); return; }
    timer.current = setTimeout(() => {
      const n = ++searchSeq.current;
      setHits((h) => ({ ...h, status: "loading" }));
      fetch(`/api/products?q=${encodeURIComponent(q.trim())}&hasPrice=1&limit=5`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          if (n === searchSeq.current) setHits({ status: "done", items: d.products || [] });
        })
        .catch(() => { if (n === searchSeq.current) setHits({ status: "error", items: [] }); });
    }, 300);
  }, []);

  const choose = (h: Hit) => setPicked(h);

  // 제품을 고르면 내 기록 횟수 · 같은 제품 공구 확인 (제품을 바꾸면 앞 응답은 버린다)
  const pickedId = picked?.id ?? null;
  useEffect(() => {
    if (!pickedId) return;
    let alive = true;
    setCheck({ ...NO_CHECK, status: "loading" }); // eslint-disable-line react-hooks/set-state-in-effect -- 고른 제품이 바뀔 때마다 확인
    fetch(`/api/community/group-buy/check?product_id=${pickedId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!alive) return;
        const lowest = d.lowest_unit && d.lowest_unit.unit > 0 ? d.lowest_unit : null;
        setCheck({ status: "done", records: d.records || 0, existing: d.existing, lowest });
        // 제품이 바뀌면 조건표를 그 제품의 최저가로 다시 시작 (10개 묶음 · 15% 할인)
        setDraft((cur) => ({ ...cur, options: [newOption(10, lowest?.unit ?? null)] }));
      })
      .catch(() => { if (alive) setCheck({ ...NO_CHECK, status: "error" }); });
    return () => { alive = false; };
  }, [pickedId]);

  // 열 때 미리 고른 제품이 있으면 그 제품으로 시작 (그리는 중에 상태를 맞춘다)
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open && initialProduct && !picked) setPicked(initialProduct);
  }

  const reset = (posted: boolean) => {
    setQuery(""); setHits({ status: "idle", items: [] }); setPicked(null); setCheck(NO_CHECK);
    setStory(""); setDraft(emptyDraft());
    clear(posted);
    vClear(posted);
  };
  const close = () => { reset(false); onClose(); };

  const [claim] = checkClaims(story);
  const offerError = draft.options.length ? parseOffer(draftToOffer(draft), check.lowest?.unit ?? null).error : null;
  const giftClaim = draft.gift === "first" ? checkClaims(draft.giftItem)[0] : undefined;
  const canPost = !!picked && check.status === "done" && !check.existing && !claim && !giftClaim && !offerError && draft.options.length > 0 && !uploading && !vBusy && !sending;

  const submit = async () => {
    if (!picked || !canPost) return;
    setSending(true);
    try {
      const res = await fetch("/api/community/group-buy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: picked.id, story: story.trim(), image_urls: urls, video,
          offer: draftToOffer(draft), target_count: draft.target, days: draft.days,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.existing_id) {
        setCheck((c) => ({ ...c, existing: { id: d.existing_id, current_count: d.current_count || 0 } }));
        throw new Error(d.error);
      }
      if (!res.ok) throw new Error(d.error);
      toast.show(`공구를 만들었어요. ${draft.days}일 동안 관심을 모아요`);
      reset(true);
      onClose();
      router.push(`/group-buy/${d.group_buy.id}`);
    } catch (e) {
      toast.show(e instanceof Error && e.message ? e.message : "공구를 만들지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setSending(false); }
  };

  const low = (h: Hit) => h.product_prices?.find((p) => p.price > 0)?.price ?? null;

  return (
    <Sheet open={open} onClose={close} title="공구 만들기" size="lg"
      description={`판매가 열리기 전엔 관심만 모아요. ${draft.target}명이 모이면 이 조건으로 판매처에 공구를 요청해요`}
      footer={
        <>
          <Button variant="secondary" block onClick={close}>취소</Button>
          <Button block disabled={!canPost} loading={sending} onClick={submit}>공구 만들기</Button>
        </>
      }>
      <div className="flex flex-col gap-6">

        {/* ── 사진 ── */}
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-ink">사진 · 영상</span>
          <VideoAttach status={vStatus} video={video} onRemove={vDrop} />
          {photos.length > 0 && <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div key={p.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt={`올린 사진 ${i + 1}`} className={cn("aspect-square w-full rounded-md border border-line object-cover", p.status === "uploading" && "opacity-50")} />
                {p.status === "done" && (
                  <IconButton icon="close" size="sm" tone="secondary" label={`사진 ${i + 1} 빼기`} className="absolute -top-2 -right-2" onClick={() => drop(p.key)} />
                )}
              </div>
            ))}
          </div>}
          <div className="flex flex-wrap gap-2">
            <Chip disabled={photos.length >= GROUP_MAX_PHOTOS || uploading} onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={16} />사진 추가 <span className="num">{photos.length}/{GROUP_MAX_PHOTOS}</span>
            </Chip>
            <Chip disabled={vBusy} onClick={() => vRef.current?.click()}>
              <Icon name="video" size={16} />{video ? "영상 바꾸기" : "영상 추가"}
            </Chip>
          </div>
          <input ref={vRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" tabIndex={-1} aria-hidden="true"
            name="group_buy_video" onChange={(e) => vPick(e.target.files)} />
          <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-hidden="true"
            name="group_buy_photo" onChange={(e) => pick(e.target.files)} />
          <p className="text-caption text-ink-2">{uploading ? "사진을 올리고 있어요" : "먹는 모습이 보이는 사진이 좋아요 · 영상은 30초까지 한 개 · 위치 같은 촬영 정보는 지우고 올려요"}</p>
        </div>

        {/* ── 제품 ── */}
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-ink">제품</span>
          {picked ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-md border border-line p-2.5">
                <Thumb src={picked.image_url} size={44} />
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <p className="text-label font-medium text-ink line-clamp-1">{picked.name}</p>
                  {check.status === "loading" && <p className="text-caption text-ink-2">기록을 확인하고 있어요</p>}
                  {check.status === "error" && <p className="text-caption text-danger">확인하지 못했어요. 제품을 다시 골라 주세요</p>}
                  {check.status === "done" && (check.records > 0 ? (
                    <p className="text-caption text-positive flex items-center gap-1"><Icon name="check" size={14} />최근 30일 <span className="num">{check.records}</span>번 기록 · 글에 표시돼요</p>
                  ) : (
                    <p className="text-caption text-ink-2">최근 30일 기록이 없어요. 기록하면 &apos;써 본 사람&apos; 표시가 붙어요</p>
                  ))}
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setPicked(null); setCheck(NO_CHECK); setDraft(emptyDraft()); }}>바꾸기</Button>
              </div>
              {check.existing && (
                <Notice icon="users" title="이 제품은 이미 관심을 모으고 있어요">
                  <div className="flex flex-col gap-2 items-start">
                    <span><span className="num">{check.existing.current_count}</span>명이 모였어요. 새로 만들지 않고 함께하면 더 빨리 모여요</span>
                    <LinkButton href={`/group-buy/${check.existing.id}`} size="sm" variant="secondary" onClick={close}>그 공구 보기</LinkButton>
                  </div>
                </Notice>
              )}
            </div>
          ) : (
            <>
              <Input value={query} placeholder="제품 이름 (예: 현미밥, 닭가슴살)" name="group_buy_product" aria-label="공구할 제품 찾기" type="search"
                onChange={(e) => { setQuery(e.target.value); search(e.target.value); }} />
              {hits.status === "loading" && <SkeletonList rows={2} />}
              {hits.status === "error" && <p className="text-caption text-danger">제품을 찾지 못했어요. 다시 입력해 주세요</p>}
              {hits.status === "done" && hits.items.length === 0 && <p className="text-caption text-ink-2">맞는 제품이 없어요. 다른 이름으로 찾아보세요</p>}
              {hits.status === "done" && hits.items.length > 0 && (
                <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                  {hits.items.map((h) => (
                    <li key={h.id}>
                      <ListRow onClick={() => choose(h)} leading={<Thumb src={h.image_url} size={40} />} title={h.name}
                        meta={<>{h.manufacturer || "제조사 정보 없음"}{low(h) != null && <> · 지금 최저 <span className="num">{low(h)!.toLocaleString("ko-KR")}</span>원</>}</>} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* ── 이야기 ── */}
        <Field label="먹어 본 이야기"
          error={claim ? `'${claim.phrase}' 같은 표현은 올릴 수 없어요. ${claim.why}. 먹는 방법이나 맛으로 써 주세요` : undefined}
          hint={claim ? undefined : <span className="flex justify-between gap-2"><span>예: 점심에 데워서 샐러드랑 먹어요</span><span className="num">{story.length}/{GROUP_STORY_MAX}</span></span>}>
          <Textarea value={story} rows={2} maxLength={GROUP_STORY_MAX} name="group_buy_story" onChange={(e) => setStory(e.target.value)} />
        </Field>

        {/* ── 조건표 — 제품을 고르고 최저가를 확인한 뒤 ── */}
        {picked && check.status === "done" && !check.existing && (
          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <Notice icon="info">진행자가 바라는 조건이에요. 판매처가 정하면 바뀔 수 있어요</Notice>
            <OfferEditor draft={draft} onChange={setDraft} lowestUnit={check.lowest?.unit ?? null} lowestChecked={check.lowest?.checked}
              error={offerError || (giftClaim ? `증정품에 '${giftClaim.phrase}' 같은 표현은 쓸 수 없어요` : null)} />
          </div>
        )}
      </div>
    </Sheet>
  );
}
