"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button, Chip, Field, Icon, IconButton, Input, LinkButton, Notice, Sheet, SkeletonList, Textarea, Thumb, cn, useToast,
} from "@/components/ui";
import { GROUP_DAYS, GROUP_MAX_PHOTOS, GROUP_STORY_MAX, GROUP_TARGET, PACK_OPTIONS, WISHES, type Wish } from "@/lib/group-buy";
import { findHealthClaim } from "@/lib/health-claims";
import { usePhotoUploads } from "./usePhotoUploads";

/**
 * 공구 만들기 — 인플루언서 공구처럼 써 본 사람이 사진·이야기와 함께 연다.
 * 제품을 고르면: 내가 최근 30일 기록한 횟수(글에 '써 본 사람'으로 붙음) · 같은 제품 공구가 모집 중이면 그쪽으로.
 * 목표 인원은 정해져 있다(GROUP_TARGET) — 모이면 판매처에 공구를 요청한다. 판매가 열리기 전엔 관심만 모은다.
 */
type Hit = { id: string; name: string; manufacturer?: string | null; image_url?: string | null; product_prices?: { price: number }[] };
type Check = { status: "idle" | "loading" | "error" | "done"; records: number; existing: { id: string; current_count: number } | null };

export default function GroupBuyComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const { photos, fileRef, pick, drop, clear, uploading, urls } = usePhotoUploads(GROUP_MAX_PHOTOS);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ status: "idle" | "loading" | "error" | "done"; items: Hit[] }>({ status: "idle", items: [] });
  const [picked, setPicked] = useState<Hit | null>(null);
  const [check, setCheck] = useState<Check>({ status: "idle", records: 0, existing: null });
  const [story, setStory] = useState("");
  const [pack, setPack] = useState<number>(10);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits({ status: "idle", items: [] }); return; }
    timer.current = setTimeout(() => {
      setHits((h) => ({ ...h, status: "loading" }));
      fetch(`/api/products?q=${encodeURIComponent(q.trim())}&hasPrice=1&limit=5`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          setHits({ status: "done", items: d.products || [] });
        })
        .catch(() => setHits({ status: "error", items: [] }));
    }, 300);
  }, []);

  const choose = (h: Hit) => {
    setPicked(h);
    setCheck({ status: "loading", records: 0, existing: null });
    fetch(`/api/community/group-buy/check?product_id=${h.id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setCheck({ status: "done", records: d.records || 0, existing: d.existing });
      })
      .catch(() => setCheck({ status: "error", records: 0, existing: null }));
  };

  const reset = (posted: boolean) => {
    setQuery(""); setHits({ status: "idle", items: [] }); setPicked(null); setCheck({ status: "idle", records: 0, existing: null });
    setStory(""); setPack(10); setWishes([]);
    clear(posted);
  };
  const close = () => { reset(false); onClose(); };

  const claim = findHealthClaim(story);
  const canPost = !!picked && check.status === "done" && !check.existing && !claim && !uploading && !sending;

  const submit = async () => {
    if (!picked || !canPost) return;
    setSending(true);
    try {
      const res = await fetch("/api/community/group-buy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: picked.id, story: story.trim(), image_urls: urls, pack_size: pack, wishes }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.existing_id) {
        setCheck((c) => ({ ...c, existing: { id: d.existing_id, current_count: d.current_count || 0 } }));
        throw new Error(d.error);
      }
      if (!res.ok) throw new Error(d.error);
      toast.show(`공구를 만들었어요. ${GROUP_DAYS}일 동안 관심을 모아요`);
      reset(true);
      onClose();
      router.push(`/group-buy/${d.group_buy.id}`);
    } catch (e) {
      toast.show(e instanceof Error && e.message ? e.message : "공구를 만들지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setSending(false); }
  };

  const toggleWish = (w: Wish) => setWishes((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]));
  const low = (h: Hit) => h.product_prices?.find((p) => p.price > 0)?.price ?? null;

  return (
    <Sheet open={open} onClose={close} title="공구 만들기" size="lg"
      description={`판매가 열리기 전엔 관심만 모아요. ${GROUP_TARGET}명이 모이면 판매처에 공구를 요청해요`}
      footer={
        <>
          <Button variant="secondary" block onClick={close}>취소</Button>
          <Button block disabled={!canPost} loading={sending} onClick={submit}>공구 만들기</Button>
        </>
      }>
      <div className="flex flex-col gap-6">

        {/* ── 사진 ── */}
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-ink">사진</span>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div key={p.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt={`올린 사진 ${i + 1}`} className={cn("aspect-square w-full rounded-md border border-line object-cover", p.status === "uploading" && "opacity-50")} />
                {p.status === "done" && (
                  <IconButton icon="close" size="sm" tone="secondary" label={`사진 ${i + 1} 빼기`} className="absolute -top-2 -right-2" onClick={() => drop(p.key)} />
                )}
              </div>
            ))}
            {photos.length < GROUP_MAX_PHOTOS && (
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
                className="press aspect-square w-full rounded-md border border-dashed border-line-strong bg-sunken flex flex-col items-center justify-center gap-1 text-caption text-ink-2 disabled:opacity-50">
                <Icon name="camera" size={20} />
                <span><span className="num">{photos.length}</span>/{GROUP_MAX_PHOTOS}</span>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-hidden="true"
            name="group_buy_photo" onChange={(e) => pick(e.target.files)} />
          <p className="text-caption text-ink-2">{uploading ? "사진을 올리고 있어요" : "먹는 모습이 보이는 사진이 좋아요 · 위치 같은 촬영 정보는 지우고 올려요"}</p>
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
                <Button size="sm" variant="ghost" onClick={() => { setPicked(null); setCheck({ status: "idle", records: 0, existing: null }); }}>바꾸기</Button>
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
                      <button type="button" onClick={() => choose(h)}
                        className="press w-full min-h-11 px-3 py-2 text-left flex items-center gap-3 hover:bg-sunken transition-colors">
                        <Thumb src={h.image_url} size={40} />
                        <span className="flex-1 min-w-0 flex flex-col">
                          <span className="text-label text-ink line-clamp-1">{h.name}</span>
                          <span className="text-caption text-ink-2 line-clamp-1">
                            {h.manufacturer || "제조사 정보 없음"}{low(h) != null && <> · 지금 최저 <span className="num">{low(h)!.toLocaleString("ko-KR")}</span>원</>}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* ── 이야기 ── */}
        <Field label="먹어 본 이야기"
          error={claim ? `'${claim}' 같은 효능 표현은 올릴 수 없어요. 먹는 방법이나 맛으로 써 주세요` : undefined}
          hint={claim ? undefined : <span className="flex justify-between gap-2"><span>예: 점심에 데워서 샐러드랑 먹어요</span><span className="num">{story.length}/{GROUP_STORY_MAX}</span></span>}>
          <Textarea value={story} rows={2} maxLength={GROUP_STORY_MAX} name="group_buy_story" onChange={(e) => setStory(e.target.value)} />
        </Field>

        {/* ── 한 사람이 살 양 ── */}
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="한 사람이 살 양">
          <span className="text-label font-medium text-ink">한 사람이 살 양</span>
          <div className="flex flex-wrap gap-2">
            {PACK_OPTIONS.map((o) => (
              <Chip key={o.value} role="radio" aria-checked={pack === o.value} selected={pack === o.value} onClick={() => setPack(o.value)}>{o.label}</Chip>
            ))}
          </div>
        </div>

        {/* ── 바라는 것 ── */}
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-ink">바라는 것 <span className="font-regular text-ink-2">· 여러 개 골라요 · 약속한 가격이 아니에요</span></span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(WISHES) as Wish[]).map((w) => (
              <Chip key={w} aria-pressed={wishes.includes(w)} selected={wishes.includes(w)} onClick={() => toggleWish(w)}>{WISHES[w]}</Chip>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
