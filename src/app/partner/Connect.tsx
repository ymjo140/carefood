"use client";

import { useRef, useState } from "react";
import { Button, Card, LinkButton, Notice, SectionHeader, buttonClass, timeAgo, useToast } from "@/components/ui";
import { Feed } from "./Feed";
import { ApiKeys } from "./ApiKeys";

export type Batch = {
  id: string; file_name: string | null; row_count: number; ok_count: number; review_count: number; error_count: number;
  unchanged_count: number; errors: RowError[]; created_at: string;
};
type RowError = { row: number; sku?: string; field?: string; message: string };

/**
 * 연동 — 내 정보가 최신인가. 세 방식을 나란히 두고 피드·API를 권한다 (v3 7.8).
 * 엑셀 올리기는 제품 탭에서 여기로 옮겼다 — 가격·재고 갱신이 연동의 일이라서.
 */
export function Connect({ qs, batches, onChanged }: { qs: string; batches: Batch[]; onChanged: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Batch | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const last = result || batches[0] || null;

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/partner/upload?${qs}`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult({
        id: d.batch_id, file_name: file.name, row_count: d.rows, ok_count: d.ok, review_count: d.review, error_count: d.error,
        unchanged_count: d.unchanged, errors: d.errors, created_at: new Date().toISOString(),
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.show(`${d.rows}줄을 올렸어요`);
      onChanged();
    } catch (e) {
      toast.show(`올리지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setUploading(false); }
  };

  return (
    <div className="flex flex-col gap-10">
      <section>
        <SectionHeader title="연동 방식" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-body font-bold text-ink">피드 · API <span className="text-label font-medium text-brand-ink">권장</span></p>
            <p className="text-label text-ink-2 mt-1">가격이 바뀌면 바로 반영돼요. 피드에서 빠진 제품은 판매 종료로 바뀌어 추천에서 빠지지 않게 지켜요</p>
          </Card>
          <Card>
            <p className="text-body font-bold text-ink">엑셀 올리기</p>
            <p className="text-label text-ink-2 mt-1">지금 바로 시작할 수 있어요. 다시 올릴 때까지 가격이 그대로라, 확인한 지 60일이 넘은 가격은 앱에서 감춰져요</p>
          </Card>
          <Card>
            <p className="text-body font-bold text-ink">대행 연동 (유료)</p>
            <p className="text-label text-ink-2 mt-1">표시사항 사진·상품 목록만 보내 주면 케어푸드가 옮겨 적어요. 업체가 &lsquo;확인했어요&rsquo;를 누른 뒤 반영해요</p>
          </Card>
        </div>
      </section>

      <Feed qs={qs} onFetched={onChanged} />
      <ApiKeys qs={qs} />

      <section>
        <SectionHeader title="엑셀로 올리기"
          action={<a href="/api/partner/template" className={buttonClass({ variant: "ghost", size: "sm" })}>양식 내려받기</a>} />
        <Card className="mb-3">
          <p className="text-label text-ink-2">
            케어푸드 양식(.xlsx)의 &lsquo;제품&rsquo; 시트에 한 줄에 제품 하나씩 적어 올려요. 가격·재고·링크만 바뀐 줄은 바로 반영되고,
            새 제품과 영양·원재료·알레르기가 바뀐 줄은 케어푸드가 확인한 뒤 반영돼요.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <label className={buttonClass({ variant: "secondary" })}>
              파일 고르기
              <input ref={fileRef} type="file" accept=".xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <span className="text-label text-ink-2 min-w-0 truncate">{file ? file.name : "고른 파일이 없어요"}</span>
            <Button className="ml-auto" disabled={!file} loading={uploading} onClick={upload}>올리기</Button>
          </div>
        </Card>
        {last && <BatchResult batch={last} fresh={!!result} />}
      </section>

      <section>
        <SectionHeader title="연동 안내" />
        <p className="text-label text-ink-2 mb-3">양식의 칸, 피드 형식, API 요청과 구매 확정 보고 방법을 한곳에 모았어요</p>
        <LinkButton href="/partner/docs" variant="secondary" size="sm">연동 안내 보기</LinkButton>
      </section>
    </div>
  );
}

/** 마지막으로 올린 결과 — 줄별 오류까지 */
function BatchResult({ batch, fresh }: { batch: Batch; fresh: boolean }) {
  const failed = batch.error_count > 0;
  return (
    <Notice tone={failed ? "danger" : "neutral"} title={`${fresh ? "방금" : timeAgo(batch.created_at)} 올린 ${batch.file_name || "파일"}`}>
      <p>
        <span className="num">{batch.row_count}</span>줄 중 바로 반영 <span className="num">{batch.ok_count}</span> ·
        검수 중 <span className="num">{batch.review_count}</span> · 바뀐 것 없음 <span className="num">{batch.unchanged_count}</span> ·
        반려 <span className="num">{batch.error_count}</span>
      </p>
      {batch.errors.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-label">
            <thead>
              <tr className="text-left text-ink-2"><th className="py-1 pr-3 font-medium whitespace-nowrap">줄</th><th className="py-1 pr-3 font-medium whitespace-nowrap">제품 코드</th><th className="py-1 font-medium">고칠 것</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {batch.errors.slice(0, 100).map((e, i) => (
                <tr key={i}><td className="py-1.5 pr-3 num align-top">{e.row}</td><td className="py-1.5 pr-3 num align-top whitespace-nowrap">{e.sku || "—"}</td><td className="py-1.5 text-ink">{e.message}</td></tr>
              ))}
            </tbody>
          </table>
          {batch.errors.length > 100 && <p className="mt-2">앞의 100개만 보여요. 고쳐서 다시 올리면 나머지도 보여요</p>}
        </div>
      )}
    </Notice>
  );
}
