import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 케어푸드",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-extrabold mb-2">개인정보처리방침</h1>
      <p className="text-sm text-muted mb-8">시행일: 2026년 10월 27일</p>

      <div className="prose-policy space-y-8 text-sm leading-relaxed text-foreground/90">
        {/* 1조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제1조 (목적)</h2>
          <p>
            케어푸드(이하 &quot;회사&quot;)는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」 등
            관련 법령을 준수합니다. 본 방침은 회사가 수집하는 개인정보의 항목, 수집 목적,
            보유·이용 기간 및 이용자의 권리에 대해 안내합니다.
          </p>
        </section>

        {/* 2조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제2조 (수집하는 개인정보 항목)</h2>

          <h3 className="text-sm font-bold mt-3 mb-1">1. 일반 개인정보</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-bold">구분</th>
                <th className="text-left py-2 font-bold">항목</th>
                <th className="text-left py-2 font-bold">수집 시점</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-b border-border/50">
                <td className="py-2">회원가입</td>
                <td className="py-2">이메일, 비밀번호(암호화)</td>
                <td className="py-2">회원가입 시</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2">소셜 로그인</td>
                <td className="py-2">이메일, 프로필 이름</td>
                <td className="py-2">소셜 로그인 시</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2">서비스 이용</td>
                <td className="py-2">검색어, 필터 사용 내역, 찜 목록, 맛 평가</td>
                <td className="py-2">서비스 이용 중</td>
              </tr>
            </tbody>
          </table>

          <h3 className="text-sm font-bold mt-4 mb-1">
            2. 민감정보 (개인정보보호법 제23조)
          </h3>
          <p className="text-muted mb-2">
            아래 정보는 건강정보에 해당하는 민감정보로, <strong className="text-foreground">별도의 동의</strong>를 받아 수집합니다.
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-bold">항목</th>
                <th className="text-left py-2 font-bold">목적</th>
                <th className="text-left py-2 font-bold">필수 여부</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-b border-border/50">
                <td className="py-2">건강 목표 (체중관리, 장건강 등)</td>
                <td className="py-2">맞춤 식품 매칭</td>
                <td className="py-2">필수</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2">질환 관심 (당뇨·혈압·신장)</td>
                <td className="py-2">성분 기준 식품 필터링</td>
                <td className="py-2">선택</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2">성별, 출생연도, 키, 체중</td>
                <td className="py-2">BMI·영양 분석</td>
                <td className="py-2">선택</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2">알레르기 정보</td>
                <td className="py-2">알레르기 유발 식품 필터링</td>
                <td className="py-2">선택</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2">식사 패턴, 맛 선호도</td>
                <td className="py-2">개인화 추천 정확도 향상</td>
                <td className="py-2">선택</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 3조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제3조 (수집·이용 목적)</h2>
          <ul className="list-disc pl-5 text-muted space-y-1">
            <li>식품 영양성분 기반 맞춤 추천 및 영양 분석 제공</li>
            <li>주간 식단 구성 및 건강식단 서비스 비교</li>
            <li>서비스 이용 통계 분석 및 품질 개선</li>
            <li>이용자 문의 대응</li>
          </ul>
          <p className="text-muted mt-2">
            수집한 개인정보는 위 목적 외에 사용하지 않으며, 제3자에게 제공하지 않습니다.
          </p>
        </section>

        {/* 4조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제4조 (보유 및 이용 기간)</h2>
          <ul className="list-disc pl-5 text-muted space-y-1">
            <li>
              <strong className="text-foreground">비회원:</strong> 기기 내(localStorage) 저장. 브라우저 데이터 삭제 시 즉시 파기.
            </li>
            <li>
              <strong className="text-foreground">회원:</strong> 회원 탈퇴 시 즉시 파기. 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관 후 파기.
            </li>
            <li>
              <strong className="text-foreground">법정 보존:</strong> 전자상거래법에 따른 거래 기록 5년, 소비자 불만 3년.
            </li>
          </ul>
        </section>

        {/* 5조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제5조 (개인정보의 파기)</h2>
          <p className="text-muted">
            보유 기간이 경과하거나 처리 목적이 달성된 경우, 지체 없이 해당 개인정보를
            파기합니다. 전자적 파일은 복구 불가능한 방법으로 삭제하며, 기록물은 분쇄
            또는 소각합니다.
          </p>
        </section>

        {/* 6조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제6조 (제3자 제공)</h2>
          <p className="text-muted">
            회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 다음의 경우는 예외입니다.
          </p>
          <ul className="list-disc pl-5 text-muted space-y-1 mt-1">
            <li>이용자가 사전에 동의한 경우</li>
            <li>법령에 의하여 요구되는 경우</li>
          </ul>
        </section>

        {/* 7조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제7조 (이용자의 권리와 행사 방법)</h2>
          <p className="text-muted">이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
          <ul className="list-disc pl-5 text-muted space-y-1 mt-1">
            <li>개인정보 열람, 정정, 삭제 요청</li>
            <li>개인정보 처리 정지 요청</li>
            <li>민감정보 수집·이용 동의 철회</li>
            <li>회원 탈퇴를 통한 전체 삭제</li>
          </ul>
          <p className="text-muted mt-2">
            권리 행사는 서비스 내 설정 또는 이메일(support@carefood.kr)로 가능합니다.
          </p>
        </section>

        {/* 8조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제8조 (개인정보의 안전성 확보 조치)</h2>
          <ul className="list-disc pl-5 text-muted space-y-1">
            <li>비밀번호 암호화 저장 (bcrypt)</li>
            <li>SSL/TLS 통신 암호화</li>
            <li>데이터베이스 접근 권한 최소화</li>
            <li>정기적 보안 점검</li>
          </ul>
        </section>

        {/* 9조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제9조 (쿠키 및 자동 수집 정보)</h2>
          <p className="text-muted">
            회사는 서비스 이용 과정에서 쿠키, 접속 로그 등을 자동으로 수집할 수 있습니다.
            이용자는 브라우저 설정을 통해 쿠키 수집을 거부할 수 있으나,
            일부 서비스 이용에 제한이 있을 수 있습니다.
          </p>
        </section>

        {/* 10조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제10조 (개인정보 보호책임자)</h2>
          <table className="w-full text-xs border-collapse">
            <tbody className="text-muted">
              <tr className="border-b border-border/50">
                <td className="py-2 font-bold text-foreground w-24">담당</td>
                <td className="py-2">개인정보 보호책임자</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 font-bold text-foreground">이메일</td>
                <td className="py-2">support@carefood.kr</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 11조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제11조 (방침 변경)</h2>
          <p className="text-muted">
            본 방침이 변경되는 경우 시행일 7일 전부터 서비스 내 공지를 통해 알립니다.
          </p>
        </section>

        {/* 면책 */}
        <section className="border-t border-border pt-6">
          <p className="text-xs text-muted leading-relaxed">
            본 서비스는 식약처 영양성분 데이터베이스 기반 정보 제공 서비스이며,
            의학적 진단·치료·처방을 대체하지 않습니다. 질환이 있는 경우 반드시 의사와 상담하세요.
          </p>
        </section>
      </div>
    </div>
  );
}
