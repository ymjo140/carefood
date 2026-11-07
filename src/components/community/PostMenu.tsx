"use client";

import { useState } from "react";
import { Button, ChoiceList, ConfirmSheet, Field, Icon, IconButton, Sheet, Textarea, useToast, type IconName } from "@/components/ui";

/**
 * 글·답글의 ··· 메뉴
 * - 내 것: 지우기
 * - 남의 것: (글이면) 숨기기 · 차단하기 · 신고하기
 * onDone 으로 화면에서 무엇을 치울지 알린다 (hidden: 이 글만 / blocked: 그 사람 것 전부 / deleted: 이것만)
 */
export const REPORT_REASON_OPTIONS = [
  { value: "spam", label: "스팸·도배" },
  { value: "ad", label: "광고·홍보" },
  { value: "abuse", label: "욕설·비방" },
  { value: "medical", label: "근거 없는 의료·효능 주장" },
  { value: "privacy", label: "개인정보 노출" },
  { value: "other", label: "기타" },
] as const;
type Reason = (typeof REPORT_REASON_OPTIONS)[number]["value"];
export type MenuDone = "hidden" | "blocked" | "deleted" | "reported";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || String(r.status));
  return d;
}

export default function PostMenu({ kind, id, authorId, authorNick, isMine, onDone, size = "sm" }: {
  kind: "post" | "comment"; id: string; authorId: string; authorNick: string; isMine: boolean;
  onDone: (what: MenuDone) => void; size?: "sm" | "md";
}) {
  const toast = useToast();
  const [open, setOpen] = useState<null | "menu" | "delete" | "block" | "report">(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const word = kind === "post" ? "글" : "답글";

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string, done: MenuDone) => {
    setBusy(true);
    try {
      await fn();
      setOpen(null);
      toast.show(ok);
      onDone(done);
    } catch {
      toast.show(`${fail}. 다시 시도해 주세요`, { tone: "danger" });
    } finally { setBusy(false); }
  };

  const items: { icon: IconName; label: string; danger?: boolean; onClick: () => void }[] = isMine
    ? [{ icon: "trash", label: `이 ${word} 지우기`, danger: true, onClick: () => setOpen("delete") }]
    : [
        ...(kind === "post" ? [{
          icon: "close" as IconName, label: "이 글 숨기기",
          onClick: () => run(() => call("/api/community/hide", "POST", { post_id: id }), "숨겼어요. 이 글은 나에게 보이지 않아요", "숨기지 못했어요", "hidden"),
        }] : []),
        { icon: "user", label: `${authorNick} 님 차단하기`, onClick: () => setOpen("block") },
        { icon: "alert", label: "신고하기", danger: true, onClick: () => { setReason(null); setDetail(""); setOpen("report"); } },
      ];

  return (
    <>
      <IconButton icon="more" size={size} label={`${word} 메뉴`} onClick={() => setOpen("menu")} />

      <Sheet open={open === "menu"} onClose={() => setOpen(null)} title={`${word} 메뉴`} size="sm">
        <ul className="flex flex-col -mx-2">
          {items.map((it) => (
            <li key={it.label}>
              <button type="button" disabled={busy} onClick={it.onClick}
                className={`press w-full flex items-center gap-3 min-h-12 px-2 rounded-md text-left text-body hover:bg-sunken transition-colors disabled:opacity-50 ${it.danger ? "text-danger" : "text-ink"}`}>
                <Icon name={it.icon} size={20} />{it.label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <ConfirmSheet open={open === "delete"} onClose={() => setOpen(null)} loading={busy}
        title={`이 ${word}을 지울까요?`} description="지운 뒤에는 되돌릴 수 없어요" confirmLabel="지우기"
        onConfirm={() => run(() => call(kind === "post" ? `/api/community/feed?id=${id}` : `/api/community/comment?id=${id}`, "DELETE"), `${word}을 지웠어요`, "지우지 못했어요", "deleted")} />

      <ConfirmSheet open={open === "block"} onClose={() => setOpen(null)} loading={busy}
        title={`${authorNick} 님을 차단할까요?`}
        description="이 사람의 글과 답글이 나에게 보이지 않고, 서로 팔로우도 끊어요. 차단은 마이페이지에서 풀 수 있어요"
        confirmLabel="차단하기"
        onConfirm={() => run(() => call("/api/community/block", "POST", { user_id: authorId }), "차단했어요", "차단하지 못했어요", "blocked")} />

      <Sheet open={open === "report"} onClose={() => setOpen(null)} title={`${word} 신고하기`}
        description="신고한 사람은 알려지지 않아요. 여러 명이 신고하면 확인할 때까지 가려요"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setOpen(null)}>취소</Button>
            <Button variant="danger" block disabled={!reason} loading={busy}
              onClick={() => run(() => call("/api/community/report", "POST", { [kind === "post" ? "post_id" : "comment_id"]: id, reason, detail }), "신고했어요. 확인하고 처리할게요", "신고하지 못했어요", "reported")}>
              신고하기
            </Button>
          </>
        }>
        <div className="flex flex-col gap-4">
          <ChoiceList label="신고 이유" options={REPORT_REASON_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} value={reason} onChange={setReason} />
          <Field label="더 알려 주실 내용 (선택)">
            <Textarea name="report_detail" rows={2} maxLength={300} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </Field>
        </div>
      </Sheet>
    </>
  );
}
