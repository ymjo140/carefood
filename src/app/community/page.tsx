"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ThreadCard, { type FeedPostData } from "@/components/community/ThreadCard";
import PostComposer, { type Attach, type ComposerPreset } from "@/components/community/PostComposer";
import ChallengeEntry from "@/components/community/ChallengeEntry";
import GroupBuyComposer from "@/components/community/GroupBuyComposer";
import ShareCardSheet, { type ShareTarget } from "@/components/community/ShareCardSheet";
import CertPickSheet from "@/components/community/CertPickSheet";
import { todayKst } from "@/lib/day";
import {
  Button, Chip, ChipRow, EmptyState, Icon, ListRow, Page, PageHeader, ReelAddTile, ReelRow, ReelSkeleton, ReelTile, SectionHeader, Sheet,
  SkeletonPost, Spinner, Tabs, mealMeta, certLine, CERT_LABEL, type CertView, useToast,
} from "@/components/ui";
import { COMMUNITY_TOPICS } from "@/lib/community-topics";
import { getOrCreateNickname, setNickname } from "@/lib/nickname";

/**
 * 피드 (쓰레드형) — 맨 위 스토리 줄(맨 앞 칸이 올리기 입구) → 챌린지 한 줄 → 보기(추천·팔로잉·모임·내 글) → 줄로 나눈 글 목록
 * 스토리 줄: 사람들이 올린 식단 · 챌린지·연속 기록 인증 · 모으는 공구를 종류 표시 없이 섞어서 (/api/community/reels). 칸을 누르면 스토리 보기(/stories)로 — 게시물은 거기서 ↗
 * 올리기: 끼니 · 저장한 식단 · 글 · 챌린지 인증 · 연속 기록 인증 · 공구 만들기
 * ds-wiring-drop: /group-buy — 공구 목록 입구는 탭 바의 공구 탭이 맡는다
 * ds-wiring-drop: /api/community/follow — 팔로우는 글 상세에서 (목록의 카드마다 있던 채운 버튼을 뺌)
 * 글마다 ··· 메뉴: 숨기기·차단·신고·(내 글) 지우기 → 목록에서 바로 뺀다
 */
type Tab = "recommend" | "following" | "topic" | "mine";

type Reel =
  | { kind: "meal"; id: string; image: string | null; author: string; seconds: number | null; meal_type: string | null; kcal: number | null; protein_g: number | null; text: string }
  | { kind: "cert"; id: string; image: string | null; author: string; seconds: number | null; cert: CertView; text: string }
  | { kind: "group_buy"; id: string; image: string | null; author: string; seconds: number | null; product_name: string; current_count: number; target_count: number; pct: number | null; days_left: number | null };

const TABS: { value: Tab; label: string }[] = [
  { value: "recommend", label: "추천" },
  { value: "following", label: "팔로잉" },
  { value: "topic", label: "모임" },
  { value: "mine", label: "내 글" },
];

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>("recommend");
  const [topic, setTopic] = useState<string>(COMMUNITY_TOPICS[0]);
  const [posts, setPosts] = useState<FeedPostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [composer, setComposer] = useState<{ open: boolean; attach: Attach | null; preset?: ComposerPreset | null }>({ open: false, attach: null });
  const [nickname, setNick] = useState("");
  const [reels, setReels] = useState<{ status: "loading" | "error" | "done"; items: Reel[] }>({ status: "loading", items: [] });
  const [reelTry, setReelTry] = useState(0);
  const [picker, setPicker] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [certPick, setCertPick] = useState(false);
  const [cert, setCert] = useState<ShareTarget | null>(null);
  const toast = useToast();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 이 기기 저장소·주소는 화면을 그린 뒤에 읽는다 */
    setNick(getOrCreateNickname());
    // 서버에 둔 이름이 기준 — 다른 기기에서 바꿨을 수 있다
    fetch("/api/community/me")
      .then(async (r) => { const d = await r.json(); if (r.ok && d.nickname) { setNickname(d.nickname); setNick(d.nickname); } })
      .catch(() => {}); // ds-allow: 못 받으면 이 기기 이름으로 보여 준다 (글을 올릴 때는 서버 이름이 붙는다)
    const qs = new URLSearchParams(window.location.search);
    const t = qs.get("tab");
    if (t === "mine" || t === "following" || t === "topic") setTab(t);
    // 기록·식단 리스트의 '나누기' — ?compose=meal&date=&meal= 또는 ?compose=plan&plan=
    const compose = qs.get("compose");
    if (compose === "meal" || compose === "plan") {
      setComposer({ open: true, attach: compose, preset: { day: qs.get("date") || undefined, meal: qs.get("meal") || undefined, planId: qs.get("plan") || undefined } });
      window.history.replaceState(null, "", "/community"); // 새로 고침해도 다시 열리지 않게
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  /* ─── 숏폼 줄 ─── */
  useEffect(() => {
    let alive = true;
    setReels((r) => ({ ...r, status: "loading" })); // eslint-disable-line react-hooks/set-state-in-effect -- 다시 불러오기
    fetch("/api/community/reels")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (alive) setReels({ status: "done", items: d.items || [] });
      })
      .catch(() => { if (alive) setReels((r) => ({ ...r, status: "error" })); });
    return () => { alive = false; };
  }, [reelTry]);

  /* ─── 불러오기 ─── */
  const fetchFeed = useCallback(async (pg = 1, append = false) => {
    if (pg === 1) setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ tab, page: String(pg) });
      if (tab === "topic") params.set("topic", topic);
      const res = await fetch(`/api/community/feed?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const incoming: FeedPostData[] = data.posts || [];
      // 쪽을 나눈 사이 새 글이 올라오면 같은 글이 다시 올 수 있다 — 이미 있는 글은 빼고 붙인다
      setPosts((prev) => (append ? [...prev, ...incoming.filter((p) => !prev.some((q) => q.id === p.id))] : incoming));
      setHasMore(data.hasMore ?? false);
      setPage(pg);
    } catch {
      setLoadError(true);
    } finally { setLoading(false); }
  }, [tab, topic]);

  useEffect(() => { fetchFeed(1, false); }, [fetchFeed]); // eslint-disable-line react-hooks/set-state-in-effect -- 보기를 바꿀 때마다 다시 불러온다

  /* ─── 아래로 내리면 더 불러오기 ─── */
  useEffect(() => {
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) fetchFeed(page + 1, true); },
      { threshold: 0.1 },
    );
    const el = sentinelRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [hasMore, page, fetchFeed]);

  /* ─── 동작 ─── */
  const handleLike = async (postId: string) => {
    const flip = (p: FeedPostData) => (p.id !== postId ? p : { ...p, is_liked: !p.is_liked, like_count: p.is_liked ? Math.max((p.like_count || 0) - 1, 0) : (p.like_count || 0) + 1 });
    setPosts((prev) => prev.map(flip));
    try {
      const res = await fetch("/api/community/like", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: postId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json().catch(() => null); // ds-allow: 숫자 맞추기는 보조 — 좋아요는 이미 반영됐다
      // 서버가 센 실제 숫자로 맞춘다 (빠르게 두 번 누른 경우 등)
      if (d && typeof d.like_count === "number") setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, is_liked: !!d.liked, like_count: d.like_count } : p)));
    } catch {
      setPosts((prev) => prev.map(flip)); // 되돌림
      toast.show("좋아요를 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const handleCopy = async (postId: string) => {
    try {
      const res = await fetch("/api/community/copy", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: postId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, copy_count: (p.copy_count || 0) + 1 } : p)));
      toast.show(`"${data.title || "식단"}" 식단 리스트에 담았어요. 아래 식단 탭에서 볼 수 있어요`);
    } catch {
      toast.show("식단 리스트에 담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const openComposer = (attach: Attach | null = null) => setComposer({ open: true, attach });
  const pick = (what: Attach | null | "group") => {
    setPicker(false);
    if (what === "group") setGroupOpen(true); else openComposer(what);
  };

  const empty = {
    recommend: { title: "아직 글이 없어요", description: "첫 번째로 오늘 식단을 나눠 보세요" },
    following: { title: "팔로잉한 사람이 아직 없어요", description: "글을 열어 마음에 드는 사람을 팔로우하면 여기에 모여요" },
    topic: { title: `${topic} 모임에 아직 글이 없어요`, description: "글을 쓸 때 이 모임을 고르면 여기에 나와요" },
    mine: { title: "아직 쓴 글이 없어요", description: "오늘 먹은 걸 기록에서 골라 바로 올릴 수 있어요" },
  }[tab];

  return (
    <Page width="narrow">
      <PageHeader title="피드" />

      {/* ── 스토리 줄: 식단·공구를 나누지 않고 자연스럽게 섞어 보여 준다 ── */}
      <section aria-label="스토리" className="pb-4 border-b border-line">
        <SectionHeader title="스토리" />
        <ReelRow label="스토리">
          <ReelAddTile onClick={() => setPicker(true)} />
          {reels.status === "loading" && <ReelSkeleton count={3} />}
          {reels.status === "done" && reels.items.map((r) => r.kind === "group_buy" ? (
            <ReelTile key={`g-${r.id}`} href={`/stories?at=group_buy-${r.id}`} image={r.image} author={r.author} seconds={r.seconds}
              tag={r.days_left != null ? (r.days_left === 0 ? "오늘 마감" : `D-${r.days_left}`) : null}
              label={`${r.author}의 공구${r.seconds != null ? ` 영상 ${r.seconds}초` : ""}: ${r.product_name}${r.pct ? `, ${r.pct}% 할인 희망` : ""}, ${r.current_count}명 모임`}
              line={r.pct
                ? <><span className="num font-bold">{r.pct}%</span> · <span className="num">{r.current_count}/{r.target_count}</span>명</>
                : <>알림 <span className="num font-bold">{r.current_count}</span>/{r.target_count}명</>} />
          ) : r.kind === "cert" ? (
            <ReelTile key={`c-${r.id}`} href={`/stories?at=cert-${r.id}`} image={r.image} author={r.author} seconds={r.seconds}
              label={`${r.author}의 ${CERT_LABEL[r.cert.kind]}`} line={certLine(r.cert)} />
          ) : (
            <ReelTile key={`m-${r.id}`} href={`/stories?at=meal-${r.id}`} image={r.image} author={r.author} seconds={r.seconds}
              label={`${r.author}의 식단${r.seconds != null ? ` 영상 ${r.seconds}초` : ""}${r.text ? `: ${r.text}` : ""}`}
              line={r.protein_g != null
                ? <>단백질 <span className="num font-bold">{Math.round(r.protein_g)}</span>g {r.meal_type ? mealMeta(r.meal_type).label : ""}</>
                : r.kcal != null
                  ? <><span className="num font-bold">{Math.round(r.kcal)}</span>kcal {r.meal_type ? mealMeta(r.meal_type).label : ""}</>
                  : r.text || "오늘의 식단"} />
          ))}
        </ReelRow>
        {reels.status === "error" && (
          <div className="mt-2 flex items-center gap-2 text-caption text-danger">
            사진 줄을 불러오지 못했어요
            <Button size="sm" variant="ghost" icon="refresh" onClick={() => setReelTry((n) => n + 1)}>다시 불러오기</Button>
          </div>
        )}
        {reels.status === "done" && reels.items.length === 0 && (
          <p className="mt-2 text-caption text-ink-2">아직 올라온 사진·영상이 없어요. 오늘 먹은 걸 사진이나 짧은 영상으로 올려 보세요</p>
        )}
      </section>

      {/* ── 챌린지 ── */}
      <ChallengeEntry />

      {/* ── 보기 전환 ── */}
      <div className="sticky top-14 z-30 -mx-4 px-4 pt-3 pb-2 bg-canvas flex flex-col gap-2 border-b border-line">
        <Tabs label="피드 보기" value={tab} onChange={setTab} items={TABS} />
        {tab === "topic" && (
          <ChipRow>
            {COMMUNITY_TOPICS.map((t) => (
              <Chip key={t} size="sm" selected={topic === t} onClick={() => setTopic(t)}>{t}</Chip>
            ))}
          </ChipRow>
        )}
      </div>

      {/* ── 글 ── */}
      <div className="flex flex-col">
        {loading && posts.length === 0 ? (
          <SkeletonPost count={3} />
        ) : loadError && posts.length === 0 ? (
          <EmptyState className="mt-4" title="피드를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => fetchFeed(1, false)}>다시 불러오기</Button>} />
        ) : posts.length === 0 ? (
          <EmptyState className="mt-4" title={empty.title} description={empty.description}
            action={tab === "following"
              ? <Button size="sm" variant="secondary" onClick={() => setTab("recommend")}>추천 글 보기</Button>
              : <Button size="sm" variant="secondary" icon="edit" onClick={() => openComposer(tab === "mine" ? "meal" : null)}>글 쓰기</Button>} />
        ) : (
          posts.map((post) => (
            <ThreadCard key={post.id} post={post}
              onLike={() => handleLike(post.id)}
              onCopy={() => handleCopy(post.id)}
              onReply={() => router.push(`/community/${post.id}#reply`)}
              onMenuDone={(what) => setPosts((prev) => (what === "blocked"
                ? prev.filter((p) => p.user_id !== post.user_id) // 그 사람 글 전부
                : prev.filter((p) => p.id !== post.id)))} />
          ))
        )}

        {hasMore && <div ref={sentinelRef} className="h-8" />}
        {hasMore && <div className="flex justify-center py-4"><Spinner size={20} /></div>}
        {loadError && posts.length > 0 && (
          <div className="flex justify-center py-4">
            <Button size="sm" variant="secondary" icon="refresh" onClick={() => fetchFeed(page + 1, true)}>더 불러오지 못했어요 · 다시 불러오기</Button>
          </div>
        )}
      </div>

      {/* ── 올리기: 무엇을 올릴지 ── */}
      <Sheet open={picker} onClose={() => setPicker(false)} title="올리기" size="sm">
        <div className="flex flex-col gap-1">
          <ListRow onClick={() => pick("meal")} leading={<Icon name="notebook" size={20} className="text-ink-2" />} title="오늘 먹은 끼니" meta="기록한 끼니에 사진·영상·한 줄을 붙여요" />
          <ListRow onClick={() => pick("plan")} leading={<Icon name="calendar" size={20} className="text-ink-2" />} title="저장한 식단" meta="며칠 치 식단을 나눠요" />
          <ListRow onClick={() => pick(null)} leading={<Icon name="edit" size={20} className="text-ink-2" />} title="글 · 투표" meta="사진·제품 태그·투표를 붙일 수 있어요" />
          <ListRow onClick={() => { setPicker(false); setCertPick(true); }} leading={<Icon name="flag" size={20} className="text-ink-2" />} title="챌린지 인증" meta="하고 있는 챌린지의 해낸 날을 카드로 올려요" />
          <ListRow onClick={() => { setPicker(false); setCert({ kind: "streak", id: todayKst() }); }} leading={<Icon name="check" size={20} className="text-ink-2" />} title="연속 기록 인증" meta="며칠째 이어서 기록했는지 카드로 올려요" />
          <ListRow onClick={() => pick("group")} leading={<Icon name="users" size={20} className="text-ink-2" />} title="공구 만들기" meta="자주 먹는 제품을 사진·영상과 함께 올려 함께 살 사람을 모아요" />
        </div>
      </Sheet>
      <GroupBuyComposer open={groupOpen} onClose={() => setGroupOpen(false)} />
      <CertPickSheet open={certPick} onClose={() => setCertPick(false)} onPick={(id) => { setCertPick(false); setCert({ kind: "challenge", id }); }} />
      <ShareCardSheet target={cert} open={!!cert} onClose={() => setCert(null)} onPosted={() => setReelTry((n) => n + 1)} />

      <PostComposer
        isOpen={composer.open}
        initialAttach={composer.attach}
        preset={composer.preset}
        nickname={nickname || "익명"}
        onClose={() => setComposer({ open: false, attach: null })}
        onPosted={() => { setReelTry((n) => n + 1); if (tab !== "recommend" && tab !== "mine") setTab("recommend"); else fetchFeed(1, false); }}
      />
    </Page>
  );
}
