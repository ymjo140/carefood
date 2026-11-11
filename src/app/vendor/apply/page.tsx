"use client";

import { useState } from "react";
import { Button, Card, Field, Icon, Input, LinkButton, Page, PageHeader, Textarea, TextLink, cn, useToast } from "@/components/ui";

const BUSINESS_TYPES = [
  { key: "meal_service", label: "건강식단 서비스", desc: "정기배송 도시락/밀프렙" },
  { key: "supplement", label: "건강기능식품", desc: "영양제/프로틴/건강즙" },
  { key: "grocery", label: "식재료/가공식품", desc: "저당/저염/유기농 식품" },
  { key: "bakery", label: "베이커리/간식", desc: "건강 빵/단백질 바/스낵" },
];

export default function VendorApplyPage() {
  const [form, setForm] = useState({
    company_name: "",
    representative: "",
    email: "",
    phone: "",
    website: "",
    business_number: "",
    business_type: "meal_service",
    product_count: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name || !form.representative || !form.email) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          product_count: form.product_count ? parseInt(form.product_count) : null,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSubmitted(true);
    } catch {
      toast.show("신청을 보내지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Page width="narrow">
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center gap-2">
          <span className="size-12 rounded-full bg-sunken text-positive flex items-center justify-center mb-2">
            <Icon name="check" size={24} />
          </span>
          <h1 className="text-title font-bold text-ink">입점 신청을 접수했어요</h1>
          <p className="text-label text-ink-2 mb-4">
            담당자가 확인한 뒤 입력하신 이메일로 안내드릴게요.
            <br />
            보통 영업일 기준 2~3일 안에 연락드려요.
          </p>
          <LinkButton href="/" variant="secondary">홈으로 가기</LinkButton>
        </div>
      </Page>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const required = <span className="text-danger" aria-hidden="true"> *</span>;

  return (
    <Page>
      <TextLink href="/" className="mb-3 min-h-11"><Icon name="chevron-left" size={16} /> 홈</TextLink>
      <PageHeader title="업체 입점 신청" description="케어푸드에서 34만 식품 DB 사용자에게 제품을 노출하세요" />

      {/* 혜택 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          { title: "맞춤 매칭", desc: "건강 목표별 사용자에게 자동 추천" },
          { title: "영양 분석", desc: "제품 영양 점수 및 시장 내 포지션 분석" },
          { title: "인사이트", desc: "수요 트렌드 및 공급 갭 리포트 제공" },
        ].map((b) => (
          <Card key={b.title} tone="sunken">
            <h3 className="text-label font-bold text-ink">{b.title}</h3>
            <p className="text-caption text-ink-2 mt-0.5">{b.desc}</p>
          </Card>
        ))}
      </div>

      {/* 신청 폼 */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={<>업체명{required}</>}>
            <Input type="text" value={form.company_name} onChange={set("company_name")} placeholder="예: 그리팅" required />
          </Field>
          <Field label={<>담당자명{required}</>}>
            <Input type="text" value={form.representative} onChange={set("representative")} placeholder="홍길동" required />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={<>이메일{required}</>}>
            <Input type="email" value={form.email} onChange={set("email")} placeholder="partner@company.com" required />
          </Field>
          <Field label="연락처">
            <Input type="tel" value={form.phone} onChange={set("phone")} placeholder="010-0000-0000" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="웹사이트">
            <Input type="url" value={form.website} onChange={set("website")} placeholder="https://company.com" />
          </Field>
          <Field label="사업자등록번호">
            <Input type="text" value={form.business_number} onChange={set("business_number")} placeholder="000-00-00000" />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-label font-medium text-ink mb-1.5">업종</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BUSINESS_TYPES.map((bt) => {
              const active = form.business_type === bt.key;
              return (
                <button
                  key={bt.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setForm({ ...form, business_type: bt.key })}
                  className={cn(
                    "text-left px-4 py-3 rounded-md border transition-colors",
                    active ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <div className={cn("text-label", active ? "font-bold text-brand-ink" : "font-medium text-ink")}>{bt.label}</div>
                  <div className="text-caption text-ink-2">{bt.desc}</div>
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label="등록 예정 제품 수">
          <Input type="number" inputMode="numeric" value={form.product_count} onChange={set("product_count")} placeholder="예: 50" />
        </Field>

        <Field label="추가 메시지">
          <Textarea value={form.message} onChange={set("message")} placeholder="업체 소개, 특장점, 협업 제안 등 자유롭게 적어 주세요" rows={4} />
        </Field>

        <Button
          type="submit"
          block
          loading={submitting}
          disabled={!form.company_name || !form.representative || !form.email}
        >
          {submitting ? "신청하는 중" : "입점 신청하기"}
        </Button>

        <p className="text-caption text-ink-2 text-center">
          신청 정보는 입점 검토 목적으로만 사용되며, 제3자에게 제공되지 않습니다.
        </p>
      </form>
    </Page>
  );
}
