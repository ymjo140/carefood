"use client";

import { useState } from "react";
import Link from "next/link";

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
      if (res.ok) setSubmitted(true);
    } catch {
      /* */
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-extrabold mb-2">신청이 접수되었습니다</h1>
          <p className="text-muted text-sm mb-6">
            담당자가 확인 후 입력하신 이메일로 안내드리겠습니다.
            <br />
            보통 영업일 기준 2~3일 내 연락드립니다.
          </p>
          <Link
            href="/"
            className="inline-block bg-primary text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-primary-dark transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <Link href="/" className="text-sm text-muted hover:text-primary transition-colors">
          ← 홈
        </Link>
        <h1 className="text-2xl font-extrabold mt-3 mb-1">업체 입점 신청</h1>
        <p className="text-sm text-muted">
          케어푸드에서 34만 식품 DB 사용자에게 제품을 노출하세요
        </p>
      </div>

      {/* 혜택 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          { emoji: "📊", title: "맞춤 매칭", desc: "건강 목표별 사용자에게 자동 추천" },
          { emoji: "🔬", title: "영양 분석", desc: "제품 영양 점수 및 시장 내 포지션 분석" },
          { emoji: "📈", title: "인사이트", desc: "수요 트렌드 및 공급 갭 리포트 제공" },
        ].map((b) => (
          <div key={b.title} className="bg-card rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <span className="text-xl">{b.emoji}</span>
            <h3 className="font-bold text-sm mt-2">{b.title}</h3>
            <p className="text-xs text-muted mt-0.5">{b.desc}</p>
          </div>
        ))}
      </div>

      {/* 신청 폼 */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold mb-1.5">
              업체명 <span className="text-accent">*</span>
            </label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              placeholder="예: 그리팅"
              className="w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-sm focus:border-primary focus:outline-none transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">
              담당자명 <span className="text-accent">*</span>
            </label>
            <input
              type="text"
              value={form.representative}
              onChange={(e) => setForm({ ...form, representative: e.target.value })}
              placeholder="홍길동"
              className="w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-sm focus:border-primary focus:outline-none transition-colors"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold mb-1.5">
              이메일 <span className="text-accent">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="partner@company.com"
              className="w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-sm focus:border-primary focus:outline-none transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">연락처</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="010-0000-0000"
              className="w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-sm focus:border-primary focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold mb-1.5">웹사이트</label>
            <input
              type="url"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://company.com"
              className="w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-sm focus:border-primary focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">사업자등록번호</label>
            <input
              type="text"
              value={form.business_number}
              onChange={(e) => setForm({ ...form, business_number: e.target.value })}
              placeholder="000-00-00000"
              className="w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-sm focus:border-primary focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold mb-2">업종</label>
          <div className="grid grid-cols-2 gap-2">
            {BUSINESS_TYPES.map((bt) => (
              <button
                key={bt.key}
                type="button"
                onClick={() => setForm({ ...form, business_type: bt.key })}
                className={`text-left px-3 py-2.5 rounded-xl border-2 transition-all text-sm ${
                  form.business_type === bt.key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="font-medium">{bt.label}</div>
                <div className="text-[10px] text-muted">{bt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold mb-1.5">등록 예정 제품 수</label>
          <input
            type="number"
            value={form.product_count}
            onChange={(e) => setForm({ ...form, product_count: e.target.value })}
            placeholder="예: 50"
            className="w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-sm focus:border-primary focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-1.5">추가 메시지</label>
          <textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="업체 소개, 특장점, 협업 제안 등 자유롭게 작성해주세요"
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-sm focus:border-primary focus:outline-none transition-colors resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !form.company_name || !form.representative || !form.email}
          className="w-full bg-primary text-white py-3.5 rounded-full font-bold text-base hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "신청 중..." : "입점 신청하기"}
        </button>

        <p className="text-[10px] text-muted text-center">
          신청 정보는 입점 검토 목적으로만 사용되며, 제3자에게 제공되지 않습니다.
        </p>
      </form>
    </div>
  );
}
