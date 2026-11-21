"use client";

import { useState } from "react";
import { Button, ChoiceList, Field, FilePick, Sheet, Textarea, TextButton, UnitInput, useToast } from "@/components/ui";
import { REPORT_KIND_LABEL, REPORT_KINDS, type ReportKind } from "@/lib/product-reports";

/**
 * 제품 상세 '정보 오류 신고' — 영양 정보 아래 한 줄 → 시트에서 무엇이 다른지 고르고(필수), 맞는 값·라벨 사진·메모는 있으면.
 * 서버: POST /api/products/[id]/report (규칙: lib/product-reports). 관리자가 고치면 알림함에 "고쳤어요"가 뜬다.
 */
const NUTRITION_FIELDS = [
  { key: "kcal", label: "열량", unit: "kcal" },
  { key: "protein_g", label: "단백질", unit: "g" },
  { key: "carbs_g", label: "탄수화물", unit: "g" },
  { key: "sodium_mg", label: "나트륨", unit: "mg" },
] as const;

export default function ProductReportButton({ productId, productName }: { productId: string; productName: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [claim, setClaim] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const reset = () => { setKind(null); setClaim({}); setNote(""); setFile(null); };
  const num = (v: string) => v.replace(/[^\d.]/g, "");

  async function send() {
    if (!kind || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      form.set("kind", kind);
      if (Object.values(claim).some(Boolean)) form.set("claimed", JSON.stringify(claim));
      if (note.trim()) form.set("note", note.trim());
      if (file) form.set("file", file);
      const r = await fetch(`/api/products/${productId}/report`, { method: "POST", body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.show(r.status >= 500 ? "신고를 보내지 못했어요. 다시 시도해 주세요" : d.error || "신고를 보내지 못했어요", { tone: "danger" });
        return;
      }
      toast.show(d.again ? "보내 주신 신고를 새 내용으로 바꿨어요. 확인하고 고칠게요" : "신고를 보냈어요. 확인하고 고칠게요");
      setOpen(false); reset();
    } catch (e) {
      console.error("정보 오류 신고:", e);
      toast.show("신고를 보내지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <p className="flex flex-wrap items-center gap-x-1 text-label text-ink-2 mb-5">
        포장의 표시와 다른가요?
        <TextButton onClick={() => setOpen(true)}>정보 오류 신고하기</TextButton>
      </p>
      <Sheet open={open} onClose={() => setOpen(false)} title="정보 오류 신고" description={`${productName} · 확인하고 고칠게요`}
        footer={<Button block disabled={!kind} loading={sending} onClick={send}>신고 보내기</Button>}>
        <div className="flex flex-col gap-4">
          <ChoiceList label="무엇이 다른가요?" value={kind} onChange={setKind}
            options={REPORT_KINDS.map((k) => ({ value: k, label: REPORT_KIND_LABEL[k] }))} />
          {kind === "nutrition" && (
            <div className="flex flex-col gap-2">
              <p className="text-label font-medium text-ink">맞는 값 (선택)</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                {NUTRITION_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <UnitInput unit={f.unit} aria-label={`${f.label} (${f.unit})`}
                      value={claim[f.key] || ""} onChange={(e) => setClaim((c) => ({ ...c, [f.key]: num(e.target.value) }))} />
                  </Field>
                ))}
              </div>
              <p className="text-caption text-ink-2">포장 뒷면 &apos;영양정보&apos;에 적힌 값을 그대로 적어 주세요. 몇 g 기준인지는 메모에 적어 주시면 좋아요</p>
            </div>
          )}
          {kind === "serving" && (
            <Field label="맞는 1회 제공량 (선택)" hint="포장에 적힌 '1회 제공량' 또는 한 개의 무게">
              <UnitInput unit="g" placeholder="예: 100" aria-label="1회 제공량 (g)"
                value={claim.serving_g || ""} onChange={(e) => setClaim({ serving_g: num(e.target.value) })} />
            </Field>
          )}
          {kind && kind !== "wrong_page" && kind !== "price" && (
            <Field label="라벨 사진 (선택)" hint="영양정보 표가 보이게 찍어 주세요 · 사진의 위치 정보는 지워서 저장해요">
              <FilePick file={file} onChange={setFile} accept="image/jpeg,image/png,image/webp,image/heic" label="사진 고르기" />
            </Field>
          )}
          {kind && (
            <Field label={kind === "other" ? "무엇이 다른가요?" : "메모 (선택)"}>
              <Textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={kind === "wrong_page" ? "예: 쿠팡 링크가 꽃 구근 상품으로 열려요" : kind === "price" ? "예: 판매가 끝났어요" : "알려 주실 내용을 적어 주세요"} />
            </Field>
          )}
        </div>
      </Sheet>
    </>
  );
}
