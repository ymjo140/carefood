import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관 | 케어푸드",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-extrabold mb-2">서비스 이용약관</h1>
      <p className="text-sm text-muted mb-8">시행일: 2026년 10월 27일</p>

      <div className="prose-policy space-y-8 text-sm leading-relaxed text-foreground/90">
        {/* 1조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제1조 (목적)</h2>
          <p>
            본 약관은 케어푸드(이하 &quot;회사&quot;)가 제공하는 식품 영양 정보 매칭 서비스(이하
            &quot;서비스&quot;)의 이용 조건 및 절차, 회사와 이용자 간의 권리·의무를 규정함을
            목적으로 합니다.
          </p>
        </section>

        {/* 2조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제2조 (서비스의 내용)</h2>
          <p>회사는 다음의 서비스를 제공합니다.</p>
          <ul className="list-disc pl-5 text-muted space-y-1 mt-1">
            <li>식약처 영양성분 데이터베이스 기반 식품 정보 검색 및 비교</li>
            <li>이용자의 건강 목표·신체 정보에 기반한 식품 매칭 추천</li>
            <li>건강식단 서비스(그리팅, 윤식단, 디자인밀 등) 제품 비교</li>
            <li>주간 식단 구성 추천</li>
            <li>식품 커뮤니티 (식단 공유, 공동구매)</li>
          </ul>
        </section>

        {/* 3조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제3조 (서비스의 성격 및 면책)</h2>
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 text-xs text-accent/90 leading-relaxed mb-3">
            <p className="font-bold mb-1">중요 안내</p>
            <p>
              본 서비스는 식약처 영양성분 데이터베이스를 기반으로 한 <strong>정보 제공
              서비스</strong>이며, 의학적 진단·치료·처방을 목적으로 하지 않습니다.
            </p>
          </div>
          <ul className="list-disc pl-5 text-muted space-y-1">
            <li>
              서비스에서 제공하는 건강 점수, 영양 분석, 식품 추천은 영양성분 데이터에
              기반한 통계적 매칭 결과이며, 의학적 판단이 아닙니다.
            </li>
            <li>
              질환이 있거나 특수한 식이 요법이 필요한 경우, 반드시 의사 또는
              영양사와 상담하시기 바랍니다.
            </li>
            <li>
              회사는 서비스를 통해 제공된 정보를 활용한 이용자의 건강 관련 결정에 대해
              책임을 지지 않습니다.
            </li>
            <li>
              제품 가격, 재고, 성분 정보는 외부 출처에서 수집한 것으로, 실제와 다를
              수 있습니다. 구매 전 해당 판매처에서 최신 정보를 확인하시기 바랍니다.
            </li>
          </ul>
        </section>

        {/* 4조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제4조 (이용 계약의 성립)</h2>
          <ul className="list-disc pl-5 text-muted space-y-1">
            <li>비회원: 서비스 접속 및 이용 시 본 약관에 동의한 것으로 간주합니다.</li>
            <li>
              회원: 회원가입 절차를 완료한 시점에 이용 계약이 성립합니다.
            </li>
          </ul>
        </section>

        {/* 5조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제5조 (이용자의 의무)</h2>
          <p className="text-muted">이용자는 다음 행위를 하여서는 안 됩니다.</p>
          <ul className="list-disc pl-5 text-muted space-y-1 mt-1">
            <li>타인의 개인정보를 도용하는 행위</li>
            <li>서비스의 정상 운영을 방해하는 행위</li>
            <li>허위 리뷰 또는 허위 정보를 게시하는 행위</li>
            <li>서비스에서 얻은 정보를 회사의 사전 동의 없이 상업적으로 이용하는 행위</li>
            <li>법령 또는 공서양속에 반하는 행위</li>
          </ul>
        </section>

        {/* 6조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제6조 (서비스의 변경 및 중단)</h2>
          <ul className="list-disc pl-5 text-muted space-y-1">
            <li>
              회사는 서비스 개선을 위해 내용을 변경할 수 있으며, 중요한 변경 사항은
              사전에 공지합니다.
            </li>
            <li>
              천재지변, 시스템 장애 등 불가피한 사유로 서비스가 일시 중단될 수 있습니다.
            </li>
          </ul>
        </section>

        {/* 7조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제7조 (지식재산권)</h2>
          <ul className="list-disc pl-5 text-muted space-y-1">
            <li>
              서비스의 디자인, 소스 코드, 건강 점수 알고리즘, 영양 분석 로직 등에
              대한 지식재산권은 회사에 귀속됩니다.
            </li>
            <li>
              식품 영양성분 데이터는 식약처 공공데이터에 기반하며, 각 건강식단 서비스의
              제품 정보는 해당 서비스 제공자에 귀속됩니다.
            </li>
          </ul>
        </section>

        {/* 8조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제8조 (외부 링크 및 제3자 서비스)</h2>
          <p className="text-muted">
            서비스에는 외부 쇼핑몰(11번가, 컬리 등) 및 건강식단 서비스(그리팅, 윤식단 등)로의
            링크가 포함되어 있습니다. 해당 사이트에서의 구매, 결제, 개인정보 처리 등은
            각 사이트의 약관 및 정책에 따르며, 회사는 이에 대해 책임을 지지 않습니다.
          </p>
        </section>

        {/* 9조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제9조 (게시물의 관리)</h2>
          <ul className="list-disc pl-5 text-muted space-y-1">
            <li>이용자가 작성한 리뷰, 식단 공유, 댓글 등의 저작권은 작성자에게 있습니다.</li>
            <li>
              회사는 다음에 해당하는 게시물을 사전 통지 없이 삭제하거나 비공개 처리할
              수 있습니다: 법령 위반, 타인의 권리 침해, 서비스 목적에 맞지 않는 광고,
              허위 정보.
            </li>
          </ul>
        </section>

        {/* 10조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제10조 (회원 탈퇴 및 자격 상실)</h2>
          <ul className="list-disc pl-5 text-muted space-y-1">
            <li>회원은 언제든지 서비스 내 설정 또는 이메일을 통해 탈퇴할 수 있습니다.</li>
            <li>
              탈퇴 시 개인정보 및 민감정보는 즉시 파기됩니다.
              다만 관련 법령에 따라 일정 기간 보관이 필요한 정보는 해당 기간 경과 후 파기됩니다.
            </li>
          </ul>
        </section>

        {/* 11조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제11조 (분쟁 해결)</h2>
          <ul className="list-disc pl-5 text-muted space-y-1">
            <li>
              서비스 이용과 관련한 분쟁은 대한민국 법령에 따라 해결합니다.
            </li>
            <li>
              회사와 이용자 간 발생한 분쟁에 대한 소송은 회사 소재지 관할 법원을 관할 법원으로 합니다.
            </li>
          </ul>
        </section>

        {/* 12조 */}
        <section>
          <h2 className="text-base font-bold mb-2">제12조 (약관의 변경)</h2>
          <p className="text-muted">
            회사는 필요한 경우 본 약관을 변경할 수 있으며, 변경된 약관은 시행일 7일 전
            서비스 내 공지를 통해 알립니다. 이용자가 변경된 약관에 동의하지 않는 경우
            서비스 이용을 중단하고 탈퇴할 수 있습니다.
          </p>
        </section>

        {/* 부칙 */}
        <section className="border-t border-border pt-6">
          <h2 className="text-base font-bold mb-2">부칙</h2>
          <p className="text-muted">본 약관은 2026년 10월 27일부터 시행합니다.</p>
        </section>
      </div>
    </div>
  );
}
