import type { Metadata } from "next";
import { Page } from "@/components/ui";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 케어푸드",
};

export default function PrivacyPage() {
  return (
    <Page width="default">
      <h1 className="text-title font-bold text-ink mb-1">개인정보처리방침</h1>
      <p className="text-label text-ink-2 mb-8">시행일: 2026년 11월 11일</p>

      <div className="flex flex-col gap-8 text-label text-ink-2">
        {/* 1조 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제1조 (목적)</h2>
          <p>
            케어푸드(이하 &quot;회사&quot;)는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」 등
            관련 법령을 준수합니다. 본 방침은 회사가 수집하는 개인정보의 항목, 수집 목적,
            보유·이용 기간 및 이용자의 권리에 대해 안내합니다.
          </p>
        </section>

        {/* 2조 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제2조 (수집하는 개인정보 항목)</h2>

          <h3 className="text-label font-bold text-ink mt-3 mb-1">1. 일반 개인정보</h3>
          <div className="overflow-x-auto">
          <table className="w-full text-caption border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="text-left py-2 pr-3 font-bold text-ink">구분</th>
                <th className="text-left py-2 pr-3 font-bold text-ink">항목</th>
                <th className="text-left py-2 pr-3 font-bold text-ink">수집 시점</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">회원가입</td>
                <td className="py-2 pr-3">이메일, 비밀번호(암호화)</td>
                <td className="py-2 pr-3">회원가입 시</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">소셜 로그인</td>
                <td className="py-2 pr-3">이메일, 프로필 이름</td>
                <td className="py-2 pr-3">소셜 로그인 시</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">서비스 이용</td>
                <td className="py-2 pr-3">검색어, 필터 사용 내역, 찜 목록, 맛 평가, 식단 기록, 저장한 식단</td>
                <td className="py-2 pr-3">서비스 이용 중</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">기기 식별</td>
                <td className="py-2 pr-3">무작위로 만든 기기 식별자(쿠키 cf_uid) — 이름·연락처와 연결하지 않음</td>
                <td className="py-2 pr-3">첫 접속 시</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">이용 횟수 확인</td>
                <td className="py-2 pr-3">접속 IP를 비밀값과 섞어 원래 값으로 되돌릴 수 없게 만든 값, 이용한 기능 종류와 시각 — 도배·자동 반복을 막는 데만 쓰고 2일 뒤 지웁니다</td>
                <td className="py-2 pr-3">글쓰기·기록 등 이용 시</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">오류 기록</td>
                <td className="py-2 pr-3">오류가 난 화면 주소, 오류 내용, 브라우저 종류 — 기기 식별자는 붙이지 않고 30일 뒤 지웁니다</td>
                <td className="py-2 pr-3">오류가 났을 때</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">구매 링크 이용</td>
                <td className="py-2 pr-3">누른 제품, 판매처, 누른 화면, 시각</td>
                <td className="py-2 pr-3">판매처 링크를 누를 때</td>
              </tr>
            </tbody>
          </table></div>

          <h3 className="text-label font-bold text-ink mt-4 mb-1">
            2. 민감정보 (개인정보보호법 제23조)
          </h3>
          <p className="mb-2">
            아래 정보는 건강정보에 해당하는 민감정보로, <strong className="text-ink">별도의 동의</strong>를 받아 수집합니다.
          </p>
          <div className="overflow-x-auto">
          <table className="w-full text-caption border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="text-left py-2 pr-3 font-bold text-ink">항목</th>
                <th className="text-left py-2 pr-3 font-bold text-ink">목적</th>
                <th className="text-left py-2 pr-3 font-bold text-ink whitespace-nowrap">필수 여부</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">건강 목표 (체중관리, 장건강 등)</td>
                <td className="py-2 pr-3">맞춤 식품 매칭</td>
                <td className="py-2 pr-3 whitespace-nowrap">필수</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">질환 관심 (당뇨·혈압·신장)</td>
                <td className="py-2 pr-3">성분 기준 식품 필터링</td>
                <td className="py-2 pr-3 whitespace-nowrap">선택</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">성별, 출생연도, 키, 체중</td>
                <td className="py-2 pr-3">BMI·영양 분석</td>
                <td className="py-2 pr-3 whitespace-nowrap">선택</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">알레르기 정보</td>
                <td className="py-2 pr-3">알레르기 유발 식품 필터링</td>
                <td className="py-2 pr-3 whitespace-nowrap">선택</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">식사 패턴, 맛 선호도</td>
                <td className="py-2 pr-3">개인화 추천 정확도 향상</td>
                <td className="py-2 pr-3 whitespace-nowrap">선택</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">커뮤니티 글·답글·사진, 커뮤니티 이름</td>
                <td className="py-2 pr-3">커뮤니티 이용 (공개). 사진은 위치 등 촬영 정보를 지운 뒤 저장합니다. 건강 관심사·목표는 글에 붙이지 않습니다</td>
                <td className="py-2 pr-3 whitespace-nowrap">선택</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">신고·숨기기·차단 기록</td>
                <td className="py-2 pr-3">커뮤니티 운영 (신고한 사람은 다른 이용자에게 알리지 않습니다)</td>
                <td className="py-2 pr-3 whitespace-nowrap">선택</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">알림을 켠 기기의 푸시 구독 정보(브라우저가 만든 주소·암호 키), 알림 종류 설정, 보낸 알림 기록</td>
                <td className="py-2 pr-3">이용자가 켠 알림(끼니 기록·주간 요약·커뮤니티 소식·챌린지) 발송. 알림을 끄면 그 기기의 구독 정보를 지웁니다</td>
                <td className="py-2 pr-3 whitespace-nowrap">선택</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">투표 선택, 챌린지 참여·시작일</td>
                <td className="py-2 pr-3">투표 결과(비율·참여자 수)와 챌린지 진행 계산. 누가 무엇을 골랐는지, 챌린지 달성 기록은 다른 이용자에게 보이지 않습니다</td>
                <td className="py-2 pr-3 whitespace-nowrap">선택</td>
              </tr>
            </tbody>
          </table></div>
        </section>

        {/* 3조 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제3조 (수집·이용 목적)</h2>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>식품 영양성분 기반 맞춤 추천 및 영양 분석 제공</li>
            <li>주간 식단 구성 및 건강식단 서비스 비교</li>
            <li>서비스 이용 통계 분석 및 품질 개선</li>
            <li>이용자 문의 대응</li>
          </ul>
          <p className="mt-2">
            수집한 개인정보는 위 목적 외에 사용하지 않으며, 제3자에게 제공하지 않습니다.
          </p>
        </section>

        {/* 4조 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제4조 (보유 및 이용 기간)</h2>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              <strong className="text-ink">비회원:</strong> 기기 식별자에 묶어 서버에 보관합니다. 쿠키를 지우면 그 기기에서는 기록에 다시 접근할 수 없으며, 삭제를 요청하면 지체 없이 파기합니다. 회원으로 로그인하면 그 기기의 기록은 회원 계정으로 옮겨집니다.
            </li>
            <li>
              <strong className="text-ink">회원:</strong> 회원 탈퇴 시 즉시 파기. 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관 후 파기.
            </li>
            <li>
              <strong className="text-ink">법정 보존:</strong> 전자상거래법에 따른 거래 기록 5년, 소비자 불만 3년.
            </li>
            <li>
              <strong className="text-ink">자동 수집:</strong> 이용 횟수 확인 값은 2일, 오류 기록은 30일 뒤 지웁니다.
            </li>
          </ul>
        </section>

        {/* 5조 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제5조 (개인정보의 파기)</h2>
          <p>
            보유 기간이 경과하거나 처리 목적이 달성된 경우, 지체 없이 해당 개인정보를
            파기합니다. 전자적 파일은 복구 불가능한 방법으로 삭제하며, 기록물은 분쇄
            또는 소각합니다.
          </p>
        </section>

        {/* 6조 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제6조 (제3자 제공)</h2>
          <p>
            회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 다음의 경우는 예외입니다.
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1 mt-1">
            <li>이용자가 사전에 동의한 경우</li>
            <li>법령에 의하여 요구되는 경우</li>
          </ul>
          <p className="mt-2">
            제품 페이지의 판매처 링크(쿠팡·컬리·11번가 등)를 누르면 해당 판매처 사이트로 이동합니다.
            회사는 이때 이용자의 개인정보를 판매처에 넘기지 않습니다. 쿠팡 파트너스 링크는 쿠팡이 자체 쿠키로
            구매 여부를 확인하며, 그 처리는 쿠팡의 개인정보처리방침을 따릅니다.
          </p>
        </section>

        {/* 6조의2 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제6조의2 (개인정보 처리의 위탁과 국외 이전)</h2>
          <p className="mb-2">회사는 서비스 운영을 위해 아래 업체에 개인정보 처리를 맡기고 있습니다.</p>
          <div className="overflow-x-auto">
          <table className="w-full text-caption border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="text-left py-2 pr-3 font-bold text-ink whitespace-nowrap">맡은 곳</th>
                <th className="text-left py-2 pr-3 font-bold text-ink">맡긴 일</th>
                <th className="text-left py-2 pr-3 font-bold text-ink">보관 위치</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">Supabase Inc.</td>
                <td className="py-2 pr-3">데이터베이스, 회원 인증, 커뮤니티 사진 저장</td>
                <td className="py-2 pr-3">대한민국 (서울 리전)</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">Vercel Inc.</td>
                <td className="py-2 pr-3">웹 서비스 운영(서버 실행은 서울 리전), 접속 기록 처리</td>
                <td className="py-2 pr-3">대한민국·미국</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3">이용자 브라우저의 푸시 서비스 (Google·Apple·Mozilla 등)</td>
                <td className="py-2 pr-3">이용자가 켠 알림 전달</td>
                <td className="py-2 pr-3">각 회사의 국외 서버</td>
              </tr>
            </tbody>
          </table></div>
          <h3 className="text-label font-bold text-ink mt-4 mb-1">국외 이전 (개인정보보호법 제28조의8)</h3>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              <strong className="text-ink">Vercel Inc. (미국)</strong> — 이전 항목: 접속 IP, 요청한 주소, 접속 시각 · 이전 시점과 방법: 서비스를 이용할 때 네트워크로 ·
              목적: 서비스 운영과 장애 대응 · 보유 기간: Vercel의 로그 보관 기간 · 거부하려면 서비스 이용을 멈추면 되며, 거부하면 서비스를 이용할 수 없습니다.
            </li>
            <li>
              <strong className="text-ink">브라우저 푸시 서비스 (미국 등)</strong> — 이전 항목: 푸시 구독 주소, 알림 문구 · 이전 시점과 방법: 알림을 보낼 때 네트워크로 ·
              목적: 알림 전달 · 보유 기간: 전달이 끝날 때까지 · 거부하려면 마이페이지 › 알림 설정에서 알림을 끄면 됩니다.
            </li>
          </ul>
        </section>

        {/* 7조 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제7조 (이용자의 권리와 행사 방법)</h2>
          <p>이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
          <ul className="list-disc pl-5 flex flex-col gap-1 mt-1">
            <li>개인정보 열람, 정정, 삭제 요청</li>
            <li>개인정보 처리 정지 요청</li>
            <li>민감정보 수집·이용 동의 철회</li>
            <li>회원 탈퇴를 통한 전체 삭제</li>
          </ul>
          <p className="mt-2">
            권리 행사는 서비스 내 설정 또는 이메일(support@carefood.kr)로 가능합니다.
          </p>
        </section>

        {/* 8조 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제8조 (개인정보의 안전성 확보 조치)</h2>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>비밀번호 암호화 저장 (bcrypt)</li>
            <li>SSL/TLS 통신 암호화</li>
            <li>데이터베이스 접근 권한 최소화 — 이용자 데이터는 서버만 읽고 쓸 수 있도록 행 단위 접근 제어(RLS) 적용</li>
            <li>기기 식별 쿠키에 서명을 붙여 다른 이용자의 기록에 접근할 수 없도록 함</li>
            <li>정기적 보안 점검</li>
          </ul>
        </section>

        {/* 9조 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제9조 (쿠키 및 자동 수집 정보)</h2>
          <p>
            회사는 서비스 이용 과정에서 쿠키, 접속 로그 등을 자동으로 수집할 수 있습니다.
            이용자는 브라우저 설정을 통해 쿠키 수집을 거부할 수 있으나,
            일부 서비스 이용에 제한이 있을 수 있습니다.
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
            <li><strong className="text-ink">cf_uid</strong> — 식단 기록·저장한 식단·찜 목록의 주인을 알아보는 기기 식별자. 유효기간 약 13개월</li>
            <li><strong className="text-ink">로그인 세션 쿠키</strong> — 회원 로그인 유지. 로그아웃하면 삭제</li>
            <li><strong className="text-ink">브라우저 저장소</strong> — 온보딩 프로필, 작성 중인 식단 등 화면 편의를 위한 정보. 기기 안에만 저장</li>
          </ul>
        </section>

        {/* 10조 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제10조 (개인정보 보호책임자)</h2>
          <div className="overflow-x-auto">
          <table className="w-full text-caption border-collapse">
            <tbody>
              <tr className="border-b border-line">
                <td className="py-2 pr-3 font-bold text-ink w-24">담당</td>
                <td className="py-2 pr-3">개인정보 보호책임자</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3 font-bold text-ink">이메일</td>
                <td className="py-2 pr-3">support@carefood.kr</td>
              </tr>
            </tbody>
          </table></div>
        </section>

        {/* 11조 */}
        <section>
          <h2 className="text-body font-bold text-ink mb-2">제11조 (방침 변경)</h2>
          <p>
            본 방침이 변경되는 경우 시행일 7일 전부터 서비스 내 공지를 통해 알립니다.
          </p>
        </section>

        {/* 면책 */}
        <section className="border-t border-line pt-6">
          <p className="text-caption text-ink-3">
            본 서비스는 식약처 영양성분 데이터베이스 기반 정보 제공 서비스이며,
            의학적 진단·치료·처방을 대체하지 않습니다. 질환이 있는 경우 반드시 의사와 상담하세요.
          </p>
        </section>
      </div>
    </Page>
  );
}
