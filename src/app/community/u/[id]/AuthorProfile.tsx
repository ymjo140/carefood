"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ThreadCard, { type FeedPostData } from "@/components/community/ThreadCard";
import {
  Avatar, Button, ConfirmSheet, EmptyState, Icon, IconButton, LinkButton, PageLoading, SkeletonPost, Spinner, Tabs, useToast,
} from "@/components/ui";

/**
 * 작성자 프로필 — 이름 · 글/팔로워/따라한 사람 · 팔로우하기 · 글 / 공유한 식단
 * 공개 글에서 나온 것만 보인다. 건강 관심사·나이대는 보이지 않는다.
 */
type Head = {
  user_id: string; nickname: string; post_count: number; plan_count: number; follower_count: number; following_count: number;
  copied_count: number; is_me: boolean; is_following: boolean; blocked: boolean;
};
type View = "posts" | "plans";

export function AuthorProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [head, setHead] = useState<{ status: "loading" | "error" | "missing" | "done"; data?: Head; message?: string }>({ status: "loading" });
  const [view, setView] = useState<View>("posts");
  const [posts, setPosts] = useState<{ status: "loading" | "error" | "done"; items: FeedPostData[]; hasMore: boolean; page: number }>({ status: "loading", items: [], hasMore: false, page: 1 });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/community/user/${encodeURIComponent(id)}`)
      .then(async (r) => {
        const d = await r.json();
        if (r.status === 404) { if (alive) setHead({ status: "missing", message: d.error }); return; }
        if (!r.ok) throw new Error(d.error);
        if (alive) setHead({ status: "done", data: d });
      })
      .catch(() => { if (alive) setHead({ status: "error" }); });
    return () => { alive = false; };
  }, [id, attempt]);

  const loadPosts = useCallback(async (page: number, append: boolean) => {
    setPosts((s) => ({ ...s, status: append ? s.status : "loading" }));
    try {
      const q = new URLSearchParams({ tab: "user", user_id: id, page: String(page) });
      if (view === "plans") q.set("only", "plan");
      const r = await fetch(`/api/community/feed?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPosts((s) => ({ status: "done", items: append ? [...s.items, ...(d.posts || [])] : d.posts || [], hasMore: !!d.hasMore, page }));
    } catch {
      setPosts((s) => ({ ...s, status: "error" }));
    }
  }, [id, view]);

  useEffect(() => { loadPosts(1, false); }, [loadPosts, attempt]); // eslint-disable-line react-hooks/set-state-in-effect -- 보기를 바꿀 때마다 다시 불러온다

  const follow = async () => {
    if (!head.data) return;
    setBusy(true);
    try {
      const r = await fetch("/api/community/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ following_id: id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const next = !!d.following;
      setHead((h) => (h.data ? { ...h, data: { ...h.data, is_following: next, follower_count: h.data.follower_count + (next ? 1 : -1) } } : h));
      toast.show(next ? "팔로우했어요. 피드의 팔로잉 보기에 이 사람 글이 모여요" : "팔로우를 취소했어요");
    } catch {
      toast.show("팔로우하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(false); }
  };

  const setBlock = async (block: boolean) => {
    setBusy(true);
    try {
      const r = await fetch("/api/community/block", { method: block ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: id }) });
      if (!r.ok) throw new Error(String(r.status));
      setBlockOpen(false);
      toast.show(block ? "차단했어요" : "차단을 풀었어요");
      setAttempt((n) => n + 1);
    } catch {
      toast.show(block ? "차단하지 못했어요. 다시 시도해 주세요" : "차단을 풀지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(false); }
  };

  const like = async (postId: string) => {
    const flip = (p: FeedPostData) => (p.id !== postId ? p : { ...p, is_liked: !p.is_liked, like_count: p.is_liked ? Math.max(0, p.like_count - 1) : p.like_count + 1 });
    setPosts((s) => ({ ...s, items: s.items.map(flip) }));
    try {
      const r = await fetch("/api/community/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: postId }) });
      if (!r.ok) throw new Error(String(r.status));
    } catch {
      setPosts((s) => ({ ...s, items: s.items.map(flip) }));
      toast.show("좋아요를 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const copy = async (postId: string) => {
    try {
      const r = await fetch("/api/community/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: postId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      setPosts((s) => ({ ...s, items: s.items.map((p) => (p.id === postId ? { ...p, copy_count: p.copy_count + 1 } : p)) }));
      toast.show(`"${d.title || "식단"}" 식단 리스트에 담았어요. 아래 식단 탭에서 볼 수 있어요`);
    } catch {
      toast.show("식단 리스트에 담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  if (head.status === "loading") return <PageLoading />;
  if (head.status === "missing") {
    return <EmptyState title={head.message || "사람을 찾을 수 없어요"} description="글을 모두 지웠거나 주소가 바뀌었을 수 있어요"
      action={<LinkButton href="/community" variant="secondary" size="sm">피드 보기</LinkButton>} />;
  }
  if (head.status === "error" || !head.data) {
    return <EmptyState title="프로필을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setHead({ status: "loading" }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />;
  }
  const h = head.data;

  return (
    <>
      <div className="flex items-center justify-between -ml-2 mb-2">
        <Button variant="ghost" size="sm" icon="chevron-left" onClick={() => router.back()}>뒤로</Button>
        {!h.is_me && <IconButton icon="more" size="sm" label="프로필 메뉴" onClick={() => setBlockOpen(true)} />}
      </div>

      <section className="flex flex-col gap-4 pb-5 border-b border-line">
        <div className="flex items-center gap-3">
          <Avatar name={h.nickname} size="lg" />
          <h1 className="text-title font-bold text-ink truncate">{h.nickname}</h1>
        </div>
        <dl className="flex gap-7">
          {([["글", h.post_count], ["팔로워", h.follower_count], ["따라한 사람", h.copied_count]] as const).map(([k, v]) => (
            <div key={k} className="flex flex-col-reverse">
              <dt className="text-caption text-ink-2">{k}</dt>
              <dd className="num text-title font-bold text-ink">{v.toLocaleString("ko-KR")}</dd>
            </div>
          ))}
        </dl>
        {h.is_me ? (
          <LinkButton href="/me" variant="secondary" block>마이페이지에서 이름 바꾸기</LinkButton>
        ) : h.blocked ? (
          <Button variant="secondary" block loading={busy} onClick={() => setBlock(false)}>차단 풀기</Button>
        ) : (
          <Button block variant={h.is_following ? "secondary" : "primary"} icon={h.is_following ? "check" : undefined} aria-pressed={h.is_following} loading={busy} onClick={follow}>
            {h.is_following ? "팔로잉" : "팔로우하기"}
          </Button>
        )}
        <p className="flex items-center gap-1.5 text-caption text-ink-2">
          <Icon name="lock" size={14} className="shrink-0" />공개한 글·식단만 보여요. 건강 정보는 보이지 않아요
        </p>
      </section>

      {h.blocked ? (
        <EmptyState className="mt-6" title="차단한 사람이에요" description="차단을 풀면 이 사람의 글을 다시 볼 수 있어요" />
      ) : (
        <>
          <Tabs variant="line" label="프로필 보기" className="mt-2" value={view} onChange={setView}
            items={[{ value: "posts", label: `글 ${h.post_count}` }, { value: "plans", label: `공유한 식단 ${h.plan_count}` }]} />
          {posts.status === "loading" && <SkeletonPost count={2} />}
          {posts.status === "error" && posts.items.length === 0 && (
            <EmptyState className="mt-4" title="글을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
              action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => loadPosts(1, false)}>다시 불러오기</Button>} />
          )}
          {posts.status === "done" && posts.items.length === 0 && (
            <EmptyState className="mt-4" title={view === "plans" ? "공유한 식단이 아직 없어요" : "아직 쓴 글이 없어요"}
              description={h.is_me ? "피드에서 저장한 일주일 식단을 붙여 올릴 수 있어요" : "글을 올리면 여기에 모여요"}
              action={<LinkButton href="/community" variant="secondary" size="sm">피드 보기</LinkButton>} />
          )}
          {posts.items.map((p) => (
            <ThreadCard key={p.id} post={p} onLike={() => like(p.id)} onCopy={() => copy(p.id)}
              onReply={() => router.push(`/community/${p.id}#reply`)}
              onMenuDone={(what) => (what === "blocked" ? setAttempt((n) => n + 1) : setPosts((s) => ({ ...s, items: s.items.filter((x) => x.id !== p.id) })))} />
          ))}
          {posts.hasMore && (
            <div className="flex justify-center py-4">
              {posts.status === "loading" ? <Spinner size={20} /> : <Button size="sm" variant="secondary" onClick={() => loadPosts(posts.page + 1, true)}>더 보기</Button>}
            </div>
          )}
        </>
      )}

      <ConfirmSheet open={blockOpen} onClose={() => setBlockOpen(false)} loading={busy}
        title={h.blocked ? `${h.nickname} 님 차단을 풀까요?` : `${h.nickname} 님을 차단할까요?`}
        description={h.blocked ? "다시 이 사람의 글과 답글이 보여요" : "이 사람의 글과 답글이 나에게 보이지 않고, 서로 팔로우도 끊어요"}
        confirmLabel={h.blocked ? "차단 풀기" : "차단하기"} tone={h.blocked ? "primary" : "danger"}
        onConfirm={() => setBlock(!h.blocked)} />
    </>
  );
}
