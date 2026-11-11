"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ThreadCard, { type FeedPostData } from "@/components/community/ThreadCard";
import PostMenu from "@/components/community/PostMenu";
import { Avatar, BottomBar, Button, Chip, EmptyState, Icon, Input, Page, PageLoading, SectionHeader, useToast } from "@/components/ui";
import { timeAgo } from "@/components/ui/FeedPost";
import { getOrCreateNickname } from "@/lib/nickname";

/**
 * 글 상세 — 글(쓰레드형) → 답글 목록 → 아래 고정 답글 입력.
 * 작성자 건강 관심사는 보여 주지 않는다 (API 도 내보내지 않음).
 */
type Comment = { id: string; author_nickname: string; content: string; created_at: string; user_id: string; parent_id: string | null; is_mine?: boolean; hidden?: boolean };
type Post = FeedPostData & { is_following?: boolean };

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [gone, setGone] = useState<string | null>(null); // 열 수 없는 이유 (가려짐·차단)
  const [replyTo, setReplyTo] = useState<{ id: string; nick: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── 글 + 답글 ── */
  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const [postRes, cRes] = await Promise.all([
          fetch(`/api/community/feed?id=${id}`),
          fetch(`/api/community/comment?post_id=${id}`),
        ]);
        if (postRes.status === 404) {
          const d = await postRes.json().catch(() => ({}));
          if (alive) { setPost(null); setGone(d.reason ? d.error : null); }
          return;
        }
        if (!postRes.ok || !cRes.ok) throw new Error(String(postRes.status));
        const postData = await postRes.json();
        const cData = await cRes.json();
        if (!alive) return;
        setPost(postData.post);
        setFollowing(postData.post?.is_following ?? false);
        setComments(cData.comments || []);
        if (window.location.hash === "#reply") setTimeout(() => inputRef.current?.focus(), 50);
      } catch {
        if (alive) setLoadError(true);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [id, reloadKey]);

  const handleLike = async () => {
    if (!post) return;
    const flip = (p: Post | null) => (p ? { ...p, is_liked: !p.is_liked, like_count: p.is_liked ? Math.max((p.like_count || 0) - 1, 0) : (p.like_count || 0) + 1 } : p);
    setPost(flip);
    try {
      const res = await fetch("/api/community/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: id }) });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json().catch(() => null); // ds-allow: 숫자 맞추기는 보조 — 좋아요는 이미 반영됐다
      if (d && typeof d.like_count === "number") setPost((p) => (p ? { ...p, is_liked: !!d.liked, like_count: d.like_count } : p));
    } catch {
      setPost(flip);
      toast.show("좋아요를 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const handleCopy = async () => {
    try {
      const res = await fetch("/api/community/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error);
      setPost((p) => (p ? { ...p, copy_count: (p.copy_count || 0) + 1 } : p));
      toast.show(`"${data.title || "식단"}" 식단 리스트에 담았어요`);
    } catch {
      toast.show("식단 리스트에 담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const handleFollow = async () => {
    if (!post) return;
    setFollowBusy(true);
    try {
      const res = await fetch("/api/community/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ following_id: post.user_id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const next = data.following ?? !following;
      setFollowing(next);
      toast.show(next ? "팔로우했어요. 팔로잉 보기에 이 사람 글이 모여요" : "팔로우를 취소했어요");
    } catch {
      toast.show("팔로우하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setFollowBusy(false); }
  };

  const handleComment = async () => {
    if (!commentText.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/community/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: id, content: commentText.trim(), parent_id: replyTo?.id ?? null, author_nickname: getOrCreateNickname() }),
      });
      const data = await res.json();
      if (!res.ok || !data.comment) throw new Error(res.status === 429 && data.error ? data.error : String(res.status));
      setComments((prev) => [...prev, data.comment]);
      setPost((p) => (p ? { ...p, comment_count: typeof data.comment_count === "number" ? data.comment_count : (p.comment_count || 0) + 1 } : p));
      setCommentText("");
      setReplyTo(null);
      toast.show("답글을 남겼어요");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.show(msg.startsWith("짧은 시간에") ? msg : "답글을 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setSending(false); }
  };

  if (loading) return <PageLoading />;

  if (!post && loadError) {
    return (
      <Page width="narrow">
        <EmptyState title="글을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => setReloadKey((k) => k + 1)}>다시 불러오기</Button>} />
      </Page>
    );
  }

  if (!post) {
    return (
      <Page width="narrow">
        <EmptyState title={gone || "글을 찾을 수 없어요"} description={gone ? "피드로 돌아가 다른 글을 볼 수 있어요" : "지워졌거나 주소가 바뀌었을 수 있어요"}
          action={<Button size="sm" variant="secondary" onClick={() => router.push("/community")}>피드로 돌아가기</Button>} />
      </Page>
    );
  }

  const tops = comments.filter((c) => !c.parent_id || !comments.some((x) => x.id === c.parent_id));
  const kids = new Map<string, Comment[]>();
  for (const c of comments) if (c.parent_id && comments.some((x) => x.id === c.parent_id)) kids.set(c.parent_id, [...(kids.get(c.parent_id) || []), c]);

  return (
    <Page width="narrow" className="pb-32">
      <div className="flex items-center justify-between gap-2 -ml-2">
        <Button variant="ghost" size="sm" icon="chevron-left" onClick={() => router.back()}>뒤로</Button>
        {!post.is_mine && (
          <Button size="sm" variant="secondary" icon={following ? "check" : "plus"} aria-pressed={following} loading={followBusy} onClick={handleFollow}>
            {following ? "팔로잉" : "팔로우하기"}
          </Button>
        )}
      </div>

      <ThreadCard post={post} detail onLike={handleLike} onCopy={handleCopy} onReply={() => { setReplyTo(null); inputRef.current?.focus(); }}
        onMenuDone={() => router.push("/community")} />

      {/* ── 답글 (한 단계까지 이어 달기) ── */}
      <section className="mt-4" aria-label="답글">
        <SectionHeader title={<>답글 {comments.length > 0 && <span className="num text-ink-2">{comments.length}</span>}</>} />
        {comments.length > 0 ? (
          <ul className="flex flex-col">
            {tops.map((c) => (
              <li key={c.id} className="flex flex-col">
                <CommentRow c={c} postAuthor={post.user_id} hasChildren={(kids.get(c.id) || []).length > 0}
                  onReply={() => { setReplyTo({ id: c.id, nick: c.author_nickname }); inputRef.current?.focus(); }}
                  onDone={(what) => setComments((prev) => (what === "blocked" ? prev.filter((x) => x.user_id !== c.user_id) : prev.filter((x) => x.id !== c.id && x.parent_id !== c.id)))} />
                {(kids.get(c.id) || []).map((k, i, arr) => (
                  <CommentRow key={k.id} c={k} postAuthor={post.user_id} nested last={i === arr.length - 1}
                    onReply={() => { setReplyTo({ id: c.id, nick: k.author_nickname }); inputRef.current?.focus(); }}
                    onDone={(what) => setComments((prev) => (what === "blocked" ? prev.filter((x) => x.user_id !== k.user_id) : prev.filter((x) => x.id !== k.id)))} />
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-label text-ink-2 text-center py-8">아직 답글이 없어요. 첫 답글을 남겨 보세요</p>
        )}
      </section>

      <BottomBar>
        <form id="reply" className="flex-1 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); handleComment(); }}>
          {replyTo && (
            <Chip size="sm" selected className="self-start" aria-label={`${replyTo.nick} 님에게 답글 그만 달기`} onClick={() => setReplyTo(null)}>
              {replyTo.nick} 님에게 답글 <Icon name="close" size={14} />
            </Chip>
          )}
          <div className="flex gap-2">
            <Input ref={inputRef} value={commentText} name="comment" maxLength={500}
              onChange={(e) => setCommentText(e.target.value)} placeholder={replyTo ? `${replyTo.nick} 님에게 답글 남기기` : `${post.author_nickname} 님에게 답글 남기기`} aria-label="답글" />
            <Button type="submit" disabled={!commentText.trim()} loading={sending} className="shrink-0">남기기</Button>
          </div>
        </form>
      </BottomBar>
    </Page>
  );
}

/** 답글 한 줄 — 왼쪽 아바타와 세로선, 오른쪽 이름·글쓴이·시간·내용·답글 달기·메뉴 */
function CommentRow({ c, postAuthor, nested = false, last = false, hasChildren = false, onReply, onDone }: {
  c: Comment; postAuthor: string; nested?: boolean; last?: boolean; hasChildren?: boolean;
  onReply: () => void; onDone: (what: "hidden" | "blocked" | "deleted" | "reported") => void;
}) {
  return (
    <div className={nested ? "flex gap-3 pl-11" : "flex gap-3"}>
      <div className="flex flex-col items-center gap-1 shrink-0">
        <Avatar name={c.author_nickname} size={nested ? "xs" : "sm"} />
        {(hasChildren || (nested && !last)) && <span aria-hidden="true" className="flex-1 w-0.5 rounded-full bg-line" />}
      </div>
      <div className="flex-1 min-w-0 pb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <Link href={`/community/u/${encodeURIComponent(c.user_id)}`} className="inline-flex items-center min-h-8 text-label font-bold text-ink truncate hover:underline underline-offset-4">{c.author_nickname}</Link>
          {c.user_id === postAuthor && <span className="text-caption text-brand-ink shrink-0">글쓴이</span>}
          <span className="text-caption text-ink-3 shrink-0">· {timeAgo(c.created_at)}</span>
          <span className="ml-auto shrink-0">
            <PostMenu kind="comment" id={c.id} authorId={c.user_id} authorNick={c.author_nickname} isMine={!!c.is_mine} onDone={onDone} />
          </span>
        </div>
        <p className="text-body text-ink whitespace-pre-line">{c.content}</p>
        {c.hidden && <p className="text-caption text-ink-2 mt-0.5">신고가 모여 다른 사람에게는 가려졌어요</p>}
        <button type="button" onClick={onReply} className="mt-0.5 min-h-8 text-label font-medium text-ink-2 hover:text-ink">답글 달기</button>
      </div>
    </div>
  );
}
