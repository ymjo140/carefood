"use client";

import { useState } from "react";
import { Button, ChoiceCard, Field, Icon, Input, LinkButton, Page, PageHeader, SectionHeader, Stat, Textarea, TextLink, useToast } from "@/components/ui";
import { APPLY_KINDS, parseApplication, type ApplyKind } from "@/lib/partner/apply";
import { AGENCY_PRICE_PER_ITEM, FLOW_MESSAGE_PRICE, PAY_DAY_OF_MONTH, STANDARD_MESSAGE_PRICE, STANDARD_RATES } from "@/lib/partner/rates";

type Form = {
  company_name: string; representative: string; email: string; phone: string; website: string;
  business_number: string; business_type: ApplyKind; product_count: string; message: string;
};
const EMPTY: Form = { company_name: "", representative: "", email: "", phone: "", website: "", business_number: "", business_type: "meal_service", product_count: "", message: "" };

/** 입점하면 — 업체 화면에서 실제로 하는 일 */
const WHAT = [
  { icon: "search" as const, title: "맞춤 추천에 보여요", desc: "목표·입맛이 맞는 사용자에게 성분 숫자로 비교해 보여 줘요. 34만 개 식품과 같은 영양 기준이에요" },
  { icon: "list" as const, title: "업체 화면 하나로 운영해요", desc: "주문 접수·송장·반품·문의, 정산, 내 고객, 수요까지 한 곳에서 봐요" },
  { icon: "link" as const, title: "제품은 편한 방법으로 올려요", desc: "엑셀 · 피드/API · 오늘끼록이 대신 올리는 대행 중에서 골라요" },
];

/**
 * 입점 신청 — 조건(수수료) 먼저, 그다음 신청서. 수수료·지급일·발송비는 lib/partner/rates.ts 와 같은 값.
 * 받은 신청은 관리 > 입점 맨 위 '입점 신청'에 모인다.
 */
export default function VendorApplyPage() {
  const toast = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [k]: e.target.value });
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = parseApplication(form); // 서버와 같은 규칙으로 먼저 본다
    if (!check.ok) { setErrors({ [check.field]: check.error }); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.field) setErrors({ [d.field]: d.error });
        throw new Error(d.error);
      }
      setSubmitted(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      toast.show(`신청을 보내지 못했어요. ${(err as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
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
            오늘끼록이 확인한 뒤 적어 주신 이메일로 연락드려요.
            <br />
            보통 영업일 2~3일 안에 연락드려요.
          </p>
          <LinkButton href="/" variant="secondary">홈으로 가기</LinkButton>
        </div>
      </Page>
    );
  }

  const required = <span className="text-danger" aria-hidden="true"> *</span>;
  return (
    <Page>
      <TextLink href="/" className="mb-3 min-h-11 pr-3"><Icon name="chevron-left" size={16} /> 홈</TextLink>
      <PageHeader title="입점 신청" description="식단을 기록하는 오늘끼록 사용자에게 내 제품을 보여 주고, 앱에서 바로 주문을 받아요" />

      <section aria-label="조건" className="mb-10">
        <SectionHeader title="조건" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 mt-3">
          <Stat label="앱 주문 수수료 · 배송비 제외" value={`${STANDARD_RATES.order}%`} emphasis />
          <Stat label="구매 링크 수수료 · 내 몰로 보낸 구매" value={`${STANDARD_RATES.link}%`} />
          <Stat label="입점비 · 월 이용료" value="0원" />
          <Stat label="정산 지급일 · 구매확정한 다음 달" value={`${PAY_DAY_OF_MONTH}일`} />
        </div>
        <ul className="mt-5 flex flex-col gap-1.5 text-label text-ink-2">
          <li>앱 주문 수수료는 판매액에서 오늘끼록 쿠폰 할인을 뺀 금액에만 매겨요. 배송비에는 붙지 않아요</li>
          <li>구매 링크 수수료는 오늘끼록 링크로 들어가 내 몰에서 구매확정된 판매액에만 매겨요</li>
          <li>아래는 고를 수 있는 기능이고, 쓴 만큼만 충전금에서 내요</li>
          <li>혜택 메시지(직접 골라 보내는 광고) · 보낸 사람 수 × <span className="num">{STANDARD_MESSAGE_PRICE}</span>원</li>
          <li>자동 알림(첫 주문 감사·다시 살 때·다시 찾아 주세요) · 보낸 건마다 <span className="num">{FLOW_MESSAGE_PRICE}</span>원</li>
          <li>대행 연동(오늘끼록이 상품 목록을 옮겨 적어 올림) · 상품당 <span className="num">{AGENCY_PRICE_PER_ITEM}</span>원</li>
        </ul>
      </section>

      <section aria-label="입점하면" className="mb-10">
        <SectionHeader title="입점하면" />
        <ul className="mt-3 flex flex-col gap-4">
          {WHAT.map((w) => (
            <li key={w.title} className="flex gap-3">
              <span className="size-10 rounded-full bg-sunken text-ink-2 flex items-center justify-center shrink-0"><Icon name={w.icon} size={20} /></span>
              <span className="min-w-0">
                <span className="block text-label font-bold text-ink">{w.title}</span>
                <span className="block text-label text-ink-2">{w.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5" aria-label="입점 신청서">
        <SectionHeader title="신청서" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={<>업체명{required}</>} error={errors.company_name}>
            <Input type="text" name="company_name" value={form.company_name} onChange={set("company_name")} placeholder="예: 그리팅" maxLength={60} required />
          </Field>
          <Field label={<>담당자명{required}</>} error={errors.representative}>
            <Input type="text" name="representative" value={form.representative} onChange={set("representative")} placeholder="홍길동" maxLength={40} required />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={<>이메일{required}</>} hint="이 주소로 연락드려요" error={errors.email}>
            <Input type="email" name="email" value={form.email} onChange={set("email")} placeholder="partner@company.com" maxLength={120} required />
          </Field>
          <Field label="연락처" error={errors.phone}>
            <Input type="tel" name="phone" value={form.phone} onChange={set("phone")} placeholder="010-0000-0000" maxLength={20} />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="웹사이트" error={errors.website}>
            <Input type="url" name="website" value={form.website} onChange={set("website")} placeholder="https://company.com" maxLength={200} />
          </Field>
          <Field label="사업자등록번호" error={errors.business_number}>
            <Input type="text" name="business_number" inputMode="numeric" value={form.business_number} onChange={set("business_number")} placeholder="000-00-00000" maxLength={20} />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-label font-medium text-ink mb-1.5">업종{required}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {APPLY_KINDS.map((k) => (
              <ChoiceCard key={k.key} size="sm" selected={form.business_type === k.key} onClick={() => setForm({ ...form, business_type: k.key })} title={k.label} description={k.desc} />
            ))}
          </div>
          {errors.business_type && <span className="text-caption text-danger">{errors.business_type}</span>}
        </fieldset>

        <Field label="올릴 제품 수" error={errors.product_count}>
          <Input type="number" name="product_count" inputMode="numeric" min={1} value={form.product_count} onChange={set("product_count")} placeholder="예: 50" />
        </Field>

        <Field label="남길 말">
          <Textarea name="message" value={form.message} onChange={set("message")} placeholder="주력 제품, 지금 파는 곳, 궁금한 점을 적어 주세요" rows={4} maxLength={2000} />
        </Field>

        <Button type="submit" block loading={submitting} disabled={!form.company_name.trim() || !form.representative.trim() || !form.email.trim()}>
          입점 신청하기
        </Button>

        <p className="text-caption text-ink-2 text-center">
          신청 정보는 입점 검토와 연락에만 사용하며, 제3자에게 제공하지 않습니다.
        </p>
      </form>
    </Page>
  );
}
