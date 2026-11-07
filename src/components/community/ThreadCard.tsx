"use client";

import { useState } from "react";
import { IconButton, MealAttach, PhotoGrid, PlanAttach, PollAttach, PostAction, PostActions, ProductTagLinks, Sheet, ThreadItem, useToast } from "@/components/ui";
import { isTopic } from "@/lib/community-topics";
import { pollRemaining, type PollView } from "@/lib/community-poll";
import PostMenu, { type MenuDone } from "./PostMenu";

type Food = { name: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number };
export type FeedPostData = {
  id: string;
  user_id: string;
  post_type: string;
  author_nickname: string;
  content?: string | null;
  meal_type?: string | null;
  meal_data?: {
    foods?: Food[];
    total?: { calories: number; protein_g: number; carbs_g: number; fat_g: number } | null;
    plan?: { title?: string; day_kcal?: (number | null)[]; avg_kcal?: number; avg_protein?: number } | null;
  } | null;
  tags?: string[] | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  products?: { id: string; name: string }[];
  poll?: PollView | null;
  like_count: number;
  comment_count: number;
  copy_count: number;
  is_liked?: boolean;
  is_mine?: boolean;
  created_at: string;
  preview_comments?: { author_nickname: string; content: string }[];
};

/**
 * 피드·상세에서 같은 모양으로 그리는 글 하나 (쓰레드형).
 * detail 이면 글로 이동하지 않고, 답글 미리보기 대신 아래 답글 목록을 쓴다.
 */
export default function ThreadCard({ post, onLike, onCopy, onReply, onMenuDone, detail = false }: {
  post: FeedPostData;
  onLike: () => void;
  onCopy?: () => void;
  onReply?: () => void;
  /** 숨기기·차단·지우기·신고 뒤 화면 정리 */
  onMenuDone?: (what: MenuDone) => void;
  detail?: boolean;
}) {
  const href = detail ? undefined : `/community/${post.id}`;
  const topic = post.tags?.find(isTopic) ?? null;
  const md = post.meal_data;
  const latest = post.preview_comments?.[0];
  const canCopy = !!(md?.plan || (md?.foods && md.foods.length > 0));
  const photos = post.image_urls?.length ? post.image_urls : post.image_url ? [post.image_url] : [];
  const [viewing, setViewing] = useState<number | null>(null);
  const alt = `${post.author_nickname} 님이 올린 사진`;

  // 투표 — 누르면 바로 반영하고, 서버 결과로 맞춘다
  const toast = useToast();
  const [poll, setPoll] = useState<PollView | null>(post.poll ?? null);
  const [seenPoll, setSeenPoll] = useState(post.poll);
  if (post.poll !== seenPoll) { setSeenPoll(post.poll); setPoll(post.poll ?? null); }
  const [voting, setVoting] = useState(false);
  const vote = async (choice: number | null) => {
    if (!poll || voting) return;
    const before = poll;
    const counts = [...poll.counts];
    if (poll.my_choice != null) counts[poll.my_choice] = Math.max(0, counts[poll.my_choice] - 1);
    if (choice != null) counts[choice] += 1;
    setPoll({ ...poll, counts, total: counts.reduce((a, b) => a + b, 0), my_choice: choice });
    setVoting(true);
    try {
      const r = await fetch("/api/community/poll", {
        method: choice == null ? "DELETE" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: post.id, choice }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      if (d.poll) setPoll(d.poll);
    } catch (e) {
      setPoll(before);
      toast.show(e instanceof Error && e.message === "마감한 투표예요" ? "마감한 투표예요" : choice == null ? "투표를 취소하지 못했어요. 다시 시도해 주세요" : "투표하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setVoting(false); }
  };

  return (
    <ThreadItem
      nickname={post.author_nickname}
      topic={topic}
      createdAt={post.created_at}
      href={href}
      authorHref={`/community/u/${encodeURIComponent(post.user_id)}`}
      reply={!detail && latest ? { nickname: latest.author_nickname, content: latest.content, more: Math.max(0, post.comment_count - 1) } : null}
      menu={onMenuDone ? <PostMenu kind="post" id={post.id} authorId={post.user_id} authorNick={post.author_nickname} isMine={!!post.is_mine} onDone={onMenuDone} /> : undefined}
      actions={
        <PostActions variant="thread">
          <PostAction icon="heart" label="좋아요" count={post.like_count} active={!!post.is_liked} onClick={onLike} />
          <PostAction icon="message" label="답글" count={post.comment_count} onClick={onReply} />
          {canCopy && onCopy && <PostAction icon="copy" label="따라하기" count={post.copy_count} onClick={onCopy} />}
        </PostActions>
      }
    >
      {post.content && <p className={detail ? "text-body text-ink whitespace-pre-line" : "text-body text-ink whitespace-pre-line line-clamp-6"}>{post.content}</p>}
      {poll && (
        <PollAttach options={poll.options} counts={poll.counts} myChoice={poll.my_choice} closed={poll.closed}
          note={pollRemaining(poll.closes_at, poll.closed)} reveal={!!post.is_mine} busy={voting} onVote={vote} />
      )}
      <PhotoGrid urls={photos} alt={alt} onOpen={detail ? setViewing : undefined} />
      {detail && photos.length > 0 && (
        <Sheet open={viewing != null} onClose={() => setViewing(null)} size="lg"
          title={photos.length > 1 ? `사진 ${(viewing ?? 0) + 1} / ${photos.length}` : "사진"}>
          {viewing != null && (
            <div className="flex flex-col gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos[viewing]} alt={alt} className="w-full max-h-[70dvh] object-contain rounded-md bg-sunken" />
              {photos.length > 1 && (
                <div className="flex justify-center gap-2">
                  <IconButton icon="chevron-left" tone="secondary" label="이전 사진" disabled={viewing === 0} onClick={() => setViewing(viewing - 1)} />
                  <IconButton icon="chevron-right" tone="secondary" label="다음 사진" disabled={viewing === photos.length - 1} onClick={() => setViewing(viewing + 1)} />
                </div>
              )}
            </div>
          )}
        </Sheet>
      )}
      {md?.plan ? (
        <PlanAttach title={md.plan.title || "저장한 식단"} dayKcal={md.plan.day_kcal || []} avgKcal={md.plan.avg_kcal} avgProtein={md.plan.avg_protein} />
      ) : md?.foods && md.foods.length > 0 ? (
        <MealAttach mealType={post.meal_type} foods={md.foods} total={md.total} />
      ) : null}
      <ProductTagLinks products={post.products} />
    </ThreadItem>
  );
}
