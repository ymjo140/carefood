"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button, CropFrame, Icon, IconButton, ListRow, Notice, PhotoPicker, Sheet, Steps, Tabs, VideoAttach, useToast,
} from "@/components/ui";
import { useVideoUpload } from "./useVideoUpload";
import { usePhotoSet } from "./composer/usePhotoSet";
import MealStep, { lastDays, type ProofChallenge } from "./composer/MealStep";
import WriteStep, { EMPTY_WRITE, pollOf, type Extra, type WriteState } from "./composer/WriteStep";
import ShareCardSheet from "./ShareCardSheet";
import { kstHour, todayKst } from "@/lib/day";

/**
 * 글쓰기 — 사진부터 (한 곳에서 시작한다).
 *  1. 사진: 찍기·앨범 6장까지, 1:1·4:5 자르기, 순서. 영상 한 개도 여기서. 사진 없이 쓰기·저장한 식단 나누기·공구 만들기는 아래 줄
 *  2. 무엇을 먹었나: 그 끼니의 식단 기록을 붙이거나 사진으로 찾아 바로 기록. 오늘 글이면 챌린지 인증 줄
 *  3. 글: 내용·태그·투표·모임·공개 범위(전체 / 팔로워만)
 *  4. 올린 뒤: 결과(인증됐는지·안 된 이유) + 인스타에 올리기(인증 카드)
 * 쓰던 글은 이 기기에 24시간 남겨 둔다(올린 사진·글·고른 것). 같은 글을 두 번 보내도 하나만 올라간다(client_key).
 * 사진은 /api/community/upload 가 위치 정보 같은 메타데이터를 지우고, 고른 모양으로 잘라 올린다.
 */
export type Attach = "meal" | "plan" | "product" | "poll";
/** 기록·식단 리스트에서 '나누기'로 열 때 미리 고를 것 — 그 날짜·끼니의 기록, 또는 그 식단 */
export type ComposerPreset = { day?: string; meal?: string; planId?: string; source?: string };

type Step = "photo" | "meal" | "write" | "done";
const STEP_TITLE: Record<Step, string> = { photo: "사진", meal: "무엇을 먹었나요", write: "글 쓰기", done: "올렸어요" };
const STEPS: Step[] = ["photo", "meal", "write"];

const DRAFT_KEY = "carefood:composer-draft";
const DRAFT_TTL = 24 * 3600e3;
type Draft = {
  at: number; client_key: string; day: string; mealType: string; linked: string[]; picked: string[];
  photos: { upload_id: string; url: string; taken_at: string | null }[]; w: Omit<WriteState, "plan">;
};
function readDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null") as Draft | null;
    return d && Date.now() - d.at < DRAFT_TTL ? d : null;
  } catch (e) { console.warn("[composer] 쓰던 글 읽기", e); return null; } // ds-allow: 없으면 새로 쓴다
}
function writeDraft(d: Draft | null) {
  try { if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); }
  catch (e) { console.warn("[composer] 쓰던 글 저장", e); } // ds-allow: 이 기기 편의 기능 — 못 남겨도 글쓰기는 된다
}

const mealNow = () => { const h = kstHour(); return h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack"; };

type Result = {
  post: { id: string };
  linked: number;
  proofs: { added: { challenge_id: string; title: string; album: boolean }[]; skipped: { challenge_id: string; title: string; reason: string }[] };
  dropped: string[]; droppedReason: string | null;
};

export default function PostComposer({ isOpen, initialAttach, preset, nickname, onClose, onPosted, onGroupBuy }: {
  isOpen: boolean;
  initialAttach?: Attach | null;
  preset?: ComposerPreset | null;
  nickname: string;
  onClose: () => void;
  onPosted: () => void;
  /** '공구 만들기' — 공구 글쓰기 시트를 연다 */
  onGroupBuy?: () => void;
}) {
  const toast = useToast();
  const notify = useCallback((m: string) => toast.show(m, { tone: "danger" }), [toast]);
  const ps = usePhotoSet(notify);
  const { video, status: vStatus, busy: vBusy, fileRef: vRef, pick: vPick, drop: vDrop, clear: vClear } = useVideoUpload();

  const [step, setStep] = useState<Step>("photo");
  const [selected, setSelected] = useState<string | null>(null);
  const [clientKey, setClientKey] = useState("");
  const [days, setDays] = useState<{ iso: string; label: string }[]>([]);
  const [day, setDay] = useState("");
  const [mealType, setMealType] = useState("lunch");
  const [linked, setLinked] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [challenges, setChallenges] = useState<{ status: "loading" | "error" | "done"; items: ProofChallenge[] }>({ status: "loading", items: [] });
  const [w, setW] = useState<WriteState>(EMPTY_WRITE);
  const [extra, setExtra] = useState<Extra>(null);
  const [source, setSource] = useState<{ id: string; nickname: string } | null>(null);
  const [srcWanted, setSrcWanted] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState<"upload" | "post" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [share, setShare] = useState(false);
  const set = useCallback((p: Partial<WriteState>) => setW((cur) => ({ ...cur, ...p })), []);

  // 시트를 열 때 — 쓰던 글이 있으면 이어 쓰고, 미리 고를 것이 있으면 그것으로 시작
  const [lastOpen, setLastOpen] = useState(false);
  if (isOpen !== lastOpen) {
    setLastOpen(isOpen);
    if (isOpen) {
      const d = lastDays();
      setDays(d);
      setResult(null);
      setSource(null);
      setSrcWanted(preset?.source ?? null);
      const draft = !preset && !initialAttach ? readDraft() : null;
      if (draft) {
        setClientKey(draft.client_key); setDay(d.some((x) => x.iso === draft.day) ? draft.day : d[0].iso); setMealType(draft.mealType);
        setLinked(draft.linked); setPicked(draft.picked); setW({ ...EMPTY_WRITE, ...draft.w, plan: null }); ps.restore(draft.photos);
        setRestored(true); setStep(draft.photos.length ? "meal" : "photo");
      } else {
        setClientKey(crypto.randomUUID().replace(/-/g, ""));
        setDay(preset?.day && d.some((x) => x.iso === preset.day) ? preset.day : d[0].iso);
        setMealType(preset?.meal ? (preset.meal === "supplement" ? "snack" : preset.meal) : mealNow());
        setLinked([]); setPicked([]); setW({ ...EMPTY_WRITE, pollOn: initialAttach === "poll" }); setRestored(false);
        setExtra(initialAttach === "plan" || preset?.planId ? "plan" : initialAttach === "product" ? "product" : null);
        setStep(initialAttach === "plan" || initialAttach === "poll" || initialAttach === "product" || preset?.planId ? "write" : "photo");
      }
    }
  }

  // 하고 있는 사진 인증 챌린지 — 오늘 기간 안에 있는 것만
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    setChallenges({ status: "loading", items: [] }); // eslint-disable-line react-hooks/set-state-in-effect -- 열 때마다 새로
    fetch("/api/community/challenges")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d.challenges as { id: string; title: string; proof?: string; me: { finished: boolean; days: { date: string; state: string }[] } | null }[]; })
      .then((list) => {
        if (!alive) return;
        const today = todayKst();
        const items = list.flatMap((c) => {
          const t = c.me && !c.me.finished && c.proof !== "none" ? c.me.days.find((x) => x.date === today) : null;
          return t && t.state !== "before" && t.state !== "future" ? [{ id: c.id, title: c.title, state: t.state }] : [];
        });
        setChallenges({ status: "done", items });
        // 처음 열 때 인증할 챌린지는 모두 골라 둔다 (이어 쓰기는 고른 것 그대로)
        if (!restored) setPicked(items.map((i) => i.id));
      })
      .catch((e) => { console.error("[composer] 챌린지 불러오기", e); if (alive) setChallenges({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [isOpen, restored]);

  // 따라 한 원본 — 원본 글쓴이 이름을 받아 온다 (못 받으면 원본 없이 쓰고 알린다)
  const srcId = isOpen ? srcWanted : null;
  useEffect(() => {
    if (!srcId) return;
    let alive = true;
    fetch(`/api/community/feed?id=${encodeURIComponent(srcId)}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || String(r.status)); return d.post as { id: string; author_nickname: string }; })
      .then((p) => { if (alive) setSource({ id: p.id, nickname: p.author_nickname }); })
      .catch((e) => { console.error(e); if (alive) toast.show("원본 글을 불러오지 못해 원본 없이 써요", { tone: "danger" }); });
    return () => { alive = false; };
  }, [srcId, toast]);

  // 미리 고를 끼니 — 그 끼니의 기록을 모두 붙인다
  useEffect(() => {
    if (!isOpen || !preset?.meal || !preset.day) return;
    let alive = true;
    fetch(`/api/diary?date=${preset.day}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return (d.entries || []) as { id: string; meal_type: string }[]; })
      .then((es) => { if (alive) setLinked(es.filter((e) => e.meal_type === preset.meal).map((e) => e.id)); })
      .catch((e) => console.error("[composer] 미리 고를 기록", e)); // ds-allow: 2단계 목록에서 직접 고를 수 있다
    return () => { alive = false; };
  }, [isOpen, preset?.meal, preset?.day]);

  // 쓰던 글 남겨 두기 — 올린 사진·글·고른 것
  useEffect(() => {
    if (!isOpen || step === "done" || !clientKey) return;
    const photos = ps.photos.filter((p) => p.upload).map((p) => ({ upload_id: p.upload!.id, url: p.upload!.url, taken_at: p.upload!.takenAt }));
    const has = photos.length || w.content.trim() || linked.length;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { plan, ...rest } = w;
    writeDraft(has ? { at: Date.now(), client_key: clientKey, day, mealType, linked, picked, photos, w: rest } : null);
  }, [isOpen, step, clientKey, ps.photos, w, day, mealType, linked, picked]);

  const reset = (posted: boolean) => {
    ps.clear(posted); vClear(posted);
    setW(EMPTY_WRITE); setLinked([]); setPicked([]); setSelected(null); setSource(null); setSrcWanted(null); setExtra(null);
    setRestored(false);
  };
  // 닫기 — 쓰던 글은 남겨 둔다(24시간). 올린 뒤면 비운다
  const close = () => {
    if (step === "done") { reset(true); writeDraft(null); }
    onClose();
  };
  const startOver = () => { reset(false); writeDraft(null); setClientKey(crypto.randomUUID().replace(/-/g, "")); setStep("photo"); setDay(days[0]?.iso || todayKst()); };

  const sel = ps.photos.find((p) => p.key === selected) ?? null;
  const hasMedia = ps.photos.length > 0 || !!video;
  const { filled, ready: pollReady } = pollOf(w);

  const toMeal = async () => {
    if (ps.photos.length) {
      setBusy("upload");
      const r = await ps.uploadAll();
      setBusy(null);
      if (!r) return;
    }
    setStep("meal");
  };

  const submit = async () => {
    setBusy("post");
    try {
      const up = ps.photos.length ? await ps.uploadAll() : { ids: [] as string[] };
      if (!up) return;
      let meal_data: Record<string, unknown> | null = null;
      if (w.plan && !linked.length) {
        const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
        const day_kcal = DAY_KEYS.map((d) => {
          const sum = Object.values(w.plan!.grid?.[d] || {}).reduce((s, c) => s + (c?.calories || 0), 0);
          return sum > 0 ? Math.round(sum) : null;
        });
        meal_data = { plan: { title: w.plan.title, grid: w.plan.grid, day_kcal, avg_kcal: w.plan.avg_daily_calories, avg_protein: w.plan.avg_daily_protein, days: w.plan.filled_days.length } };
      }
      const proofOn = day === todayKst() && up.ids.length > 0;
      const res = await fetch("/api/community/feed", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_key: clientKey,
          content: w.content.trim() || null,
          meal_type: mealType, day,
          diary_ids: linked,
          meal_data,
          upload_ids: up.ids,
          video,
          product_ids: w.products.map((p) => p.id),
          poll: w.pollOn ? { options: filled, days: w.pollDays } : null,
          topic: w.topic || null,
          people: w.people.map((p) => p.id),
          source_post_id: source?.id ?? null,
          visibility: w.visibility,
          show_kcal: w.showKcal,
          challenge_ids: proofOn ? picked : [],
          author_nickname: nickname,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error);
      writeDraft(null);
      setResult({ post: d.post, linked: linked.length, proofs: d.proofs || { added: [], skipped: [] }, dropped: d.dropped || [], droppedReason: d.dropped_reason || null });
      setStep("done");
      onPosted();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const known = ["선택지를 서로 다르게 2개 이상 적어 주세요", "투표 질문을 내용에 적어 주세요", "한 끼니의 기록만 붙여 주세요", "이미 다른 글에 쓴 사진이에요. 사진을 다시 골라 주세요"];
      toast.show(known.includes(msg) || msg.startsWith("짧은 시간에") ? msg : "올리지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const canPost = !busy && !vBusy && pollReady && (w.content.trim().length > 0 || linked.length > 0 || !!w.plan || hasMedia);
  const at = STEPS.indexOf(step);

  const footer = step === "photo" ? (
    <>
      <Button variant="secondary" block onClick={close}>닫기</Button>
      <Button block onClick={toMeal} disabled={!hasMedia || vBusy} loading={busy === "upload"}>다음</Button>
    </>
  ) : step === "meal" ? (
    <>
      <Button variant="secondary" block onClick={() => setStep("photo")}>이전</Button>
      <Button block onClick={() => setStep("write")}>다음</Button>
    </>
  ) : step === "write" ? (
    <>
      <Button variant="secondary" block onClick={() => setStep(hasMedia || linked.length ? "meal" : "photo")}>이전</Button>
      <Button block onClick={submit} disabled={!canPost} loading={busy === "post"}>올리기</Button>
    </>
  ) : (
    <>
      <Button variant="secondary" block onClick={close}>닫기</Button>
      <Button block icon="share" onClick={() => setShare(true)}>인스타에 올리기</Button>
    </>
  );

  return (
    <>
      <Sheet open={isOpen} onClose={close} title={STEP_TITLE[step]} size="lg" footer={footer}>
        <div className="flex flex-col gap-5">
          {step !== "done" && <Steps total={STEPS.length} current={Math.max(0, at)} />}
          {restored && step !== "done" && (
            <Notice title="쓰던 글을 이어서 써요">
              <Button size="sm" variant="ghost" onClick={startOver}>지우고 새로 쓰기</Button>
            </Notice>
          )}

          {step === "photo" && (
            <div className="flex flex-col gap-5">
              <PhotoPicker photos={ps.picked} selected={selected} disabled={!!busy}
                onAdd={(files) => ps.add(files)} onSelect={(k) => setSelected(selected === k ? null : k)}
                onRemove={(k) => { ps.remove(k); if (selected === k) setSelected(null); }} />
              {ps.photos.length > 0 && (
                <Tabs<"square" | "portrait"> variant="line" label="사진 모양" value={ps.aspect} onChange={ps.setAspect}
                  items={[{ value: "square", label: "정사각 1:1" }, { value: "portrait", label: "세로 4:5" }]} />
              )}
              {sel && (
                <div className="flex flex-col gap-3">
                  {sel.blob ? (
                    <CropFrame src={sel.preview} natural={sel.natural} aspect={ps.aspect} value={sel.crop} onChange={(v) => ps.setCrop(sel.key, v)} />
                  ) : (
                    <p className="text-label text-ink-2">이어 쓰기로 불러온 사진은 자르기를 바꿀 수 없어요. 빼고 다시 고르면 돼요</p>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-label text-ink-2 flex-1">순서 바꾸기</span>
                    <IconButton icon="chevron-left" tone="secondary" label="앞으로 옮기기" disabled={ps.photos[0]?.key === sel.key} onClick={() => ps.move(sel.key, -1)} />
                    <IconButton icon="chevron-right" tone="secondary" label="뒤로 옮기기" disabled={ps.photos[ps.photos.length - 1]?.key === sel.key} onClick={() => ps.move(sel.key, 1)} />
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <VideoAttach status={vStatus} video={video} onRemove={vDrop} />
                <Button size="sm" variant="secondary" icon="video" className="self-start" disabled={vBusy} onClick={() => vRef.current?.click()}>{video ? "영상 바꾸기" : "영상 붙이기"}</Button>
                <input ref={vRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" tabIndex={-1} aria-hidden="true" name="video" onChange={(e) => vPick(e.target.files)} />
              </div>
              <div className="flex flex-col border-t border-line pt-2">
                <ListRow onClick={() => setStep("write")} leading={<Icon name="edit" size={20} className="text-ink-2" />} title="사진 없이 쓰기" meta="글·투표만 올려요" />
                <ListRow onClick={() => { setExtra("plan"); setStep("write"); }} leading={<Icon name="calendar" size={20} className="text-ink-2" />} title="저장한 식단 나누기" meta="며칠 치 식단을 나눠요" />
                {onGroupBuy && <ListRow onClick={() => { onClose(); onGroupBuy(); }} leading={<Icon name="users" size={20} className="text-ink-2" />} title="공구 만들기" meta="함께 살 사람을 모아요" />}
              </div>
            </div>
          )}

          {step === "meal" && (
            <MealStep day={day} setDay={setDay} days={days} mealType={mealType} setMealType={setMealType}
              linked={linked} setLinked={setLinked} photo={ps.photos[0]?.blob ?? null}
              challenges={challenges} picked={picked} setPicked={setPicked} />
          )}

          {step === "write" && (
            <WriteStep key={extra ?? "none"} w={w} set={set} hasMeal={linked.length > 0} initialExtra={extra} source={source} onDropSource={() => setSource(null)} />
          )}

          {step === "done" && result && <DoneLines r={result} />}
        </div>
      </Sheet>
      <ShareCardSheet target={share && result ? { kind: "meal", id: result.post.id } : null} open={share && !!result} onClose={() => setShare(false)} />
    </>
  );
}

function DoneLines({ r }: { r: Result }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2 text-body text-ink">
        <li className="flex items-start gap-2"><Icon name="check" size={20} className="text-positive shrink-0" />글을 올렸어요</li>
        {r.linked > 0 && <li className="flex items-start gap-2"><Icon name="check" size={20} className="text-positive shrink-0" />식단 기록 <span className="num">{r.linked}</span>개를 붙였어요</li>}
        {r.proofs.added.map((p) => (
          <li key={p.challenge_id} className="flex items-start gap-2"><Icon name="flag" size={20} className="text-positive shrink-0" />
            <span>{p.title} 오늘 인증했어요{p.album && <span className="text-ink-2"> · 앨범에서 고름</span>}</span></li>
        ))}
        {r.proofs.skipped.map((p) => (
          <li key={p.challenge_id} className="flex items-start gap-2"><Icon name="alert" size={20} className="text-danger shrink-0" />
            <span>{p.title} 인증하지 못했어요 · {p.reason}</span></li>
        ))}
        {r.dropped.length > 0 && (
          <li className="flex items-start gap-2"><Icon name="alert" size={20} className="text-danger shrink-0" />
            <span>{r.dropped.join(", ")} 님은 태그하지 못했어요 · {r.droppedReason || "태그를 받지 않는 사람이에요"}</span></li>
        )}
      </ul>
      <p className="text-label text-ink-2">인스타에 올리면 공유 링크를 복사해 두고 공유 창을 열어요. 스토리 링크 스티커에 붙여 넣으면 돼요</p>
    </div>
  );
}
