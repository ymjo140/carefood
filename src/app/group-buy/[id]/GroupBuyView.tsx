"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ShareCardSheet from "@/components/community/ShareCardSheet";
import {
  Avatar, BottomBar, Button, EmptyState, Icon, LinkButton, ListRow, Notice, OfferOptionList, Page, PostAction, PostActions, ProgressBar, QtyStepper,
  ReelMedia, SectionHeader, Sheet, Skeleton, TextButton, Thumb, timeAgo, useToast,
} from "@/components/ui";
import { Questions, type QuestionsHandle } from "./Questions";
import { GROUP_BUY_ENABLED } from "@/lib/features";
import { giftLabel, groupBuyWords, offerRows, readOffer, shippingLabel, wishLabel, PER_PERSON_MAX } from "@/lib/group-buy";

/**
 * 공구 게시물 — 스토리 보기의 '게시물'·공구 목록·공유 링크에서 들어온다. 글 상세와 같은 모양(뒤로 → 진행자 → 사진).
 * 진행자 줄: 이름 · 최근 30일 이 제품 기록 횟수(써 본 사람). 진행자에게는 '인증 카드 만들기'(인스타 공유)
 * 아래: 먹어 본 이야기 → 좋아요·질문·보내기 → 제품(영양·지금 최저가) → 모인 인원 → 사람당 묶음·바라는 것 → 질문 → 주 버튼(열리면 알림 받기)
 */
type GroupBuy = {
  id: string; product_id: string | null; product_name: string; description: string | null;
  image_urls: string[]; image_url: string | null; video_url: string | null; video_poster: string | null; pack_size: number | null; wishes: string[];
  target_count: number; current_count: number | null; status: string; expires_at: string | null; created_at: string;
  lowest_price: number | null; product_image: string | null; host_nickname: string; host_records: number; protein_g: number | null; calories: number | null;
  like_count: number; comment_count: number; reached_at: string | null; requested_at: string | null; is_host: boolean;
  offer: unknown; lowest_unit_price: number | null;
};
type Choice = { option: number | null; qty: number };

const OPEN = GROUP_BUY_ENABLED;

function daysLeft(expires: string | null) {
  if (!expires) return null;
  return Math.max(0, Math.ceil((Date.parse(expires) - Date.now()) / 86400e3));
}
const WORD = groupBuyWords(OPEN);

export default function GroupBuyView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [card, setCard] = useState(false);
  const [state, setState] = useState<{ status: "loading" | "error" | "missing" | "done"; gb: GroupBuy | null; marked: boolean; liked: boolean; choice: Choice | null }>({ status: "loading", gb: null, marked: false, liked: false, choice: null });
  // 알림 받기 시트 — 구성·수량 고르기 (조건표가 있는 공구)
  const [picking, setPicking] = useState(false);
  const [pickOpt, setPickOpt] = useState<number | null>(null);
  const [pickQty, setPickQty] = useState(1);
  const [liking, setLiking] = useState(false);
  const questions = useRef<QuestionsHandle>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, status: "loading" })); // eslint-disable-line react-hooks/set-state-in-effect -- 다시 불러오기
    fetch(`/api/community/group-buy/${id}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 404) { if (alive) setState({ status: "missing", gb: null, marked: false, liked: false, choice: null }); return; }
        if (!r.ok) throw new Error(d.error);
        if (alive) setState({ status: "done", gb: d.group_buy, marked: !!d.marked, liked: !!d.liked, choice: d.choice ?? null });
      })
      .catch(() => { if (alive) setState((s) => ({ ...s, status: "error" })); });
    return () => { alive = false; };
  }, [id, attempt]);

  const gb = state.gb;

  const offer = gb ? readOffer(gb.offer) : null;

  /** 켜기(구성·수량과 함께)·바꾸기·끄기 — on=false 면 끄기 */
  const mark = async (on: boolean, choice?: Choice) => {
    if (!gb) return;
    const wasMarked = state.marked;
    setBusy(true);
    try {
      const res = await fetch("/api/community/group-buy/join", {
        method: on ? "POST" : "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_buy_id: gb.id, option: choice?.option ?? undefined, qty: choice?.qty ?? undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error);
      setState((s) => ({
        ...s, marked: on, choice: on ? choice ?? { option: null, qty: 1 } : null,
        gb: s.gb && typeof d.current_count === "number" ? { ...s.gb, current_count: d.current_count } : s.gb,
      }));
      setPicking(false);
      toast.show(!on ? WORD.undo : d.changed === "choice" ? "고른 구성을 바꿨어요" : WORD.done);
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : null;
      toast.show(msg || `${!on ? WORD.undoFail : wasMarked ? "바꾸지 못했어요" : WORD.fail}. 다시 시도해 주세요`, { tone: "danger" });
    } finally { setBusy(false); }
  };

  /** 주 버튼 — 조건표가 있으면 구성·수량 시트, 없으면(예전 공구) 바로 켜고 끄기 */
  const onMain = () => {
    if (!offer) { mark(!state.marked); return; }
    setPickOpt(state.choice?.option ?? (offer.options.length === 1 ? 0 : null));
    setPickQty(state.choice?.qty ?? 1);
    setPicking(true);
  };

  const like = async () => {
    if (!gb || liking) return;
    const was = state.liked;
    const flip = (liked: boolean, n: number) => setState((s) => ({ ...s, liked, gb: s.gb ? { ...s.gb, like_count: Math.max(0, n) } : s.gb }));
    flip(!was, gb.like_count + (was ? -1 : 1));
    setLiking(true);
    try {
      const res = await fetch(`/api/community/group-buy/${gb.id}/like`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error);
      flip(!!d.liked, d.like_count); // 서버가 센 숫자로 맞춘다
    } catch {
      flip(was, gb.like_count);
      toast.show("좋아요를 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setLiking(false); }
  };

  const share = async () => {
    const url = `${window.location.origin}/group-buy/${id}`;
    try {
      if (navigator.share) { await navigator.share({ title: gb ? `${gb.product_name} 공구` : "공구", url }); return; }
      await navigator.clipboard.writeText(url);
      toast.show("링크를 복사했어요");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // 보내기 창을 닫음
      toast.show("링크를 복사하지 못했어요. 주소창의 주소를 보내 주세요", { tone: "danger" });
    }
  };

  if (state.status === "loading") {
    return (
      <Page width="narrow">
        <div role="status" aria-label="불러오는 중" className="flex flex-col gap-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Page>
    );
  }
  if (state.status === "missing") {
    return (
      <Page width="narrow">
        <EmptyState title="공구를 찾지 못했어요" description="지워졌거나 주소가 바뀌었을 수 있어요"
          action={<LinkButton href="/group-buy" size="sm" variant="secondary">공구 목록 보기</LinkButton>} />
      </Page>
    );
  }
  if (state.status === "error" || !gb) {
    return (
      <Page width="narrow">
        <EmptyState title="공구를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>} />
      </Page>
    );
  }

  const count = gb.current_count || 0;
  const left = daysLeft(gb.expires_at);
  const closed = gb.status !== "recruiting" || left === 0;
  const wish = offer ? null : wishLabel(gb.wishes);
  const rows = offer ? offerRows(offer, gb.lowest_unit_price) : [];
  const gift = offer ? giftLabel(offer.gift) : null;
  const maxQty = offer?.per_person_max || PER_PERSON_MAX;
  const gbTarget = { kind: "group_buy" as const, id: gb.id };

  return (
    <Page width="narrow">
      <div className="flex items-center justify-between gap-2 -ml-2 mb-3">
        <Button variant="ghost" size="sm" icon="chevron-left" onClick={() => (window.history.length > 1 ? router.back() : router.push("/group-buy"))}>뒤로</Button>
        {gb.is_host && <Button size="sm" variant="secondary" icon="share" onClick={() => setCard(true)}>인증 카드 만들기</Button>}
      </div>

      <div className="flex items-center gap-2.5 min-w-0 mb-3">
        <Avatar name={gb.host_nickname} size="md" />
        <div className="min-w-0 flex flex-col gap-0.5">
          <p className="text-label text-ink truncate"><span className="font-bold">{gb.host_nickname}</span> <span className="text-ink-2">· 공구 진행 · {timeAgo(gb.created_at)}</span></p>
          {gb.host_records > 0 && (
            <p className="text-caption text-ink-2 flex items-center gap-1"><Icon name="check" size={14} className="text-positive" />최근 30일 이 제품을 <span className="num font-bold text-ink">{gb.host_records}</span>번 기록했어요</p>
          )}
        </div>
      </div>

      <ReelMedia urls={gb.image_urls} fallback={gb.image_url} video={gb.video_url && gb.video_poster ? { url: gb.video_url, poster: gb.video_poster } : null}
        alt={`${gb.host_nickname}의 ${gb.product_name} 공구`} />

      <div className="flex flex-col gap-5 pt-5">
        {gb.description && <p className="text-body text-ink">{gb.description}</p>}

        <PostActions variant="thread">
          <PostAction icon="heart" label="좋아요" count={gb.like_count} active={state.liked} onClick={like} />
          <PostAction icon="message" label="질문" count={gb.comment_count} onClick={() => questions.current?.focus()} />
          <PostAction icon="share" label="보내기" onClick={share} />
        </PostActions>

        {gb.product_id && (
          <ListRow href={`/products/${gb.product_id}`} className="border border-line px-2.5"
            leading={<Thumb src={gb.product_image} size={48} />}
            title={gb.product_name}
            meta={
              <>
                {gb.protein_g != null && <>단백질 <span className="num font-bold text-protein">{Math.round(gb.protein_g)}</span>g · </>}
                {gb.calories != null && <><span className="num font-bold text-ink">{Math.round(gb.calories)}</span>kcal · </>}
                {gb.lowest_price != null ? <>지금 최저 <span className="num font-bold text-ink">{gb.lowest_price.toLocaleString("ko-KR")}</span>원</> : "아직 가격 정보가 없어요"}
              </>
            } />
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-label text-ink-2">{OPEN ? "참여 인원" : "알림 받는 사람"}</span>
            <span className="text-label text-ink-2">
              <span className="num text-title font-bold text-ink">{count}</span> / <span className="num">{gb.target_count}</span>명
              {left != null && <> · {closed ? "마감" : left === 0 ? "오늘 마감" : <><span className="num">{left}</span>일 남음</>}</>}
            </span>
          </div>
          <ProgressBar value={count} max={gb.target_count} label={OPEN ? "참여 인원" : "알림 받는 사람"} />
          <p className="text-caption text-ink-2">
            {gb.requested_at ? "판매처에 공구를 요청했어요" : gb.reached_at ? "목표 인원이 모였어요. 판매처에 요청할 차례예요" : `${gb.target_count}명이 모이면 판매처에 공구를 요청해요`}
            {!offer && gb.pack_size ? <> · 모두 합쳐 <span className="num">{(count * gb.pack_size).toLocaleString("ko-KR")}</span>팩</> : null}
          </p>
        </div>

        {offer && (
          <section aria-label="공구 조건" className="flex flex-col gap-2">
            <SectionHeader title="공구 조건" description="진행자가 바라는 조건이에요. 판매처가 정하면 바뀔 수 있어요" />
            <OfferOptionList rows={rows} />
            <dl className="flex flex-col gap-1.5 text-label">
              <div className="flex gap-4"><dt className="w-20 shrink-0 text-ink-2">배송</dt><dd className="min-w-0 text-ink">{shippingLabel(offer.shipping)}</dd></div>
              {gift && <div className="flex gap-4"><dt className="w-20 shrink-0 text-ink-2">증정</dt><dd className="min-w-0 text-ink">{gift}</dd></div>}
              {offer.per_person_max && <div className="flex gap-4"><dt className="w-20 shrink-0 text-ink-2">1인 최대</dt><dd className="min-w-0 text-ink"><span className="num">{offer.per_person_max}</span>세트</dd></div>}
            </dl>
            {state.marked && state.choice?.option != null && rows[state.choice.option] && (
              <p className="text-label text-ink-2">내가 고른 것: <span className="text-ink">{rows[state.choice.option].title} × <span className="num">{state.choice.qty}</span>세트</span></p>
            )}
          </section>
        )}

        {!offer && (gb.pack_size || wish) && (
          <dl className="flex flex-col gap-1.5 text-label">
            {gb.pack_size ? <div className="flex gap-4"><dt className="w-16 shrink-0 text-ink-2">사람당</dt><dd className="min-w-0 text-ink"><span className="num">{gb.pack_size}</span>팩 묶음</dd></div> : null}
            {wish && <div className="flex gap-4"><dt className="w-16 shrink-0 text-ink-2">바라는 것</dt><dd className="min-w-0 text-ink">{wish} <span className="text-ink-2">· 약속한 가격이 아니에요</span></dd></div>}
          </dl>
        )}

        {!OPEN && (
          <Notice icon="lock">판매는 준비가 끝나면 열려요. 알림을 받으면 열릴 때 가장 먼저 알려 드려요</Notice>
        )}

        <Questions ref={questions} groupBuyId={gb.id} hostName={gb.host_nickname} closed={closed}
          onCount={(n) => setState((s) => (s.gb ? { ...s, gb: { ...s.gb, comment_count: n } } : s))} />
      </div>

      <BottomBar>
        <Button block disabled={closed} loading={busy && !picking} variant={state.marked ? "secondary" : "primary"}
          icon={state.marked ? "check" : "bell"} aria-pressed={state.marked} onClick={onMain}>
          {closed ? "마감된 공구예요" : state.marked ? (offer ? `${WORD.marked} · 바꾸기` : WORD.marked) : WORD.mark}
        </Button>
      </BottomBar>

      {/* ── 알림 받기: 구성·수량 고르기 ── */}
      {offer && (
        <Sheet open={picking} onClose={() => setPicking(false)} title={state.marked ? "고른 구성 바꾸기" : WORD.mark}
          description="판매가 열리면 고른 구성으로 알려 드려요. 판매처에 보여 줄 수요로도 쓰여요"
          footer={<Button block disabled={pickOpt == null} loading={busy} onClick={() => mark(true, { option: pickOpt, qty: pickQty })}>
            {state.marked ? "바꾸기" : "알림 받기"}
          </Button>}>
          <div className="flex flex-col gap-5">
            <OfferOptionList rows={rows} value={pickOpt} onChange={setPickOpt} label="구성 고르기" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-label font-medium text-ink">수량 <span className="font-regular text-ink-2">· 최대 <span className="num">{maxQty}</span>세트</span></span>
              <QtyStepper value={pickQty} max={maxQty} onChange={setPickQty} unit="세트" />
            </div>
            {state.marked && (
              <TextButton className="self-start" disabled={busy} onClick={() => mark(false)}>알림 끄기</TextButton>
            )}
          </div>
        </Sheet>
      )}
      <ShareCardSheet target={gbTarget} open={card} onClose={() => setCard(false)} />
    </Page>
  );
}
