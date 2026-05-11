import Link from "next/link";
import { ChevronLeft, BrainCircuit, Gauge, Waypoints, ArrowRight } from "lucide-react";

export default function SurveyIntroPage() {
  return (
    // 배경색은 옅은 회색(#F8F9FA)으로 깔아줍니다.
    <main className="flex flex-col w-full h-full bg-[#F8F9FA] relative font-sans">
      
      {/* 상단 네비게이션 (하얀색 바탕 박스) */}
      <header className="w-full bg-white px-4 py-4 flex items-center">
        <Link href="/" className="inline-flex items-center hover:opacity-80 transition-opacity">
          <img src="/icons/arrow.svg" alt="화살표 아이콘" className="w-5 h-5 mr-2" />
          <span className="text-[#2F2F2F] font-medium text-lg">나가기</span>
        </Link>
      </header>

      {/* 본문 컨텐츠 영역 (양옆 여백 적용) */}
      <div className="flex flex-col flex-1 px-6 pt-8 pb-8">
        
        {/* 중앙 플로팅 그래픽 영역 */}
        <div className="relative w-56 h-56 mx-auto mt-4 mb-16">
          {/* 하얀색 배경 박스 */}
          <div className="absolute inset-3 bg-white rounded-[32px] shadow-sm "></div>
          
          {/* 노란색 메인 박스 */}
          <div className="absolute inset-8 bg-[#FFCC00] rounded-[24px] shadow-md transform -rotate-6 flex items-center justify-center ">
            <img src="/icons/brain.svg" alt="멘토링 설문 아이콘" className="w-16 h-16 transform rotate-12 text-[#1A1A1A]" />
          </div>

          {/* 우측 상단 검은색 미니 박스 */}
          <div className="absolute top-0 right-0 w-16 h-16 bg-[#1A1A1A] rounded-2xl flex items-center justify-center transform rotate-12 shadow-lg">
            <img src="/icons/gauge.svg" className="w-8 h-8 text-[#FFCC00]" />
          </div>

          {/* 좌측 하단 검은색 미니 박스 */}
          <div className="absolute bottom-2 left-0 w-14 h-14 bg-[#1A1A1A] rounded-2xl flex items-center justify-center transform -rotate-12 shadow-lg">
            <img src="/icons/waypoints.svg" className="w-7 h-7 text-[#FFCC00]" />
          </div>
        </div>

        {/* 텍스트 영역 */}
        <div className="flex flex-col items-center text-center px-2 flex-grow">
          <h1 className="text-3xl font-semibold text-[#1A1A1A] mb-5 tracking-tight">
            멘토링 유형 테스트
          </h1>
          <p className="text-[#666666] leading-relaxed mb-auto">
            원활한 멘토링 진행 및 도움을 위해<br />
            멘토링 유형 테스트를 진행할게요.<br />
            나의 멘토링 유형을 알아볼까요?
          </p>
        </div>

        {/* 하단 프로그레스 & 시작 버튼 영역 */}
        <div className="w-full flex flex-col items-center mt-8 mb-4">
          {/* 프로그레스 바 */}
          <div className="w-48 h-1.5 bg-gray-200 rounded-full mb-3 overflow-hidden">
            <div className="w-2 h-full bg-[#FFCC00] rounded-full"></div>
          </div>
          
          <span className="text-xs font-medium tracking-widest text-gray-500 mb-10">
            READY TO START
          </span>

          {/* 시작하기 버튼 */}
          <Link href="/survey/question" className="w-full bg-[#FFCC00] text-[#1A1A1A] font-semibold text-lg py-4 rounded-2xl flex items-center justify-center shadow-lg hover:bg-[#E6B800] active:scale-[0.98] transition-all">
            시작하기
            <ArrowRight className="w-5 h-5 ml-2" strokeWidth={2.5} />
          </Link>
        </div>

      </div>
    </main>
  );
}