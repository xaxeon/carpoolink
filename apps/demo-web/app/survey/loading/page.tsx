"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit } from "lucide-react";

export default function SurveyLoadingPage() {
  const router = useRouter();

  useEffect(() => {
    // 2.5초(2500ms) 뒤에 결과 화면(/survey/result)으로 자동 이동시킵니다.
    const timer = setTimeout(() => {
      router.push("/survey/result");
    }, 2500);

    // 컴포넌트가 언마운트될 때 타이머를 정리해줍니다.
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="flex flex-col min-h-screen bg-[#F8F9FA] mx-auto max-w-md relative font-sans items-center justify-center px-6">
      
      {/* 중앙 로딩 애니메이션 영역 */}
      <div className="relative flex items-center justify-center mb-10">
        {/* 1. 바깥쪽 노란색 스피너 (빙글빙글 도는 애니메이션) */}
        <div className="absolute w-28 h-28 border-[4px] border-[#E5E7EB] border-t-[#FFCC00] rounded-full animate-spin"></div>
        
        {/* 2. 안쪽 하얀색 원과 아이콘 (깜빡이는 애니메이션) */}
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md z-10">
          <img src="/icons/brain.svg" alt="멘토링 설문 아이콘" className="w-10 h-10 transform rotate-6 text-[#1A1A1A] animate-pulse" />
        </div>
      </div>

      {/* 텍스트 영역 */}
      <h1 className="text-2xl sm:text-[28px] font-bold text-[#1A1A1A] mb-4 tracking-tight text-center leading-snug">
        나의 멘토링 유형을<br />분석하고 있어요
      </h1>
      <p className="text-[#666666] text-[16px] text-center animate-pulse">
        잠시만 기다려주세요...
      </p>

    </main>
  );
}