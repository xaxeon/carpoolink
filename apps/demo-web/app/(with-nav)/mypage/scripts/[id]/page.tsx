"use client";

import { use, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, FileText } from "lucide-react";

export default function PublishedScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 💡 테스트용 더미 데이터입니다. 마스킹된 영역을 보여주기 위해 span 태그를 포함했습니다.
    if (contentRef.current && !contentRef.current.innerHTML) {
      contentRef.current.innerHTML = `During our session today, we discussed the <span style="background-color: #FFCC00;">strategic roadmap</span> for the upcoming quarter. We focused on three main pillars: operational efficiency, stakeholder communication, and technical debt reduction.<br><br>I noticed that your approach to delegating tasks has improved significantly. However, you should still monitor the velocity of the secondary team when sharing the board with <span style="background-color: #FFCC00;">junior designers</span>.`;
    }
  }, []);

  return (
    <main className="flex flex-col w-full h-[100dvh] bg-white text-[#1A1A1A] font-sans overflow-hidden relative">
      
      {/* 💡 편집기의 '멘티 뷰' CSS 로직을 그대로 가져왔습니다. */}
      <style>{`
        .mentee-view-container span[style*="rgb(255, 204, 0)"], 
        .mentee-view-container span[style*="#FFCC00"], 
        .mentee-view-container span[style*="#ffcc00"] {
          color: transparent !important; 
          background-color: #FFCC00 !important; 
          user-select: none;
          border-radius: 3px; 
          padding: 2px 0;
        }
      `}</style>

      {/* 헤더 */}
      <header className="flex items-center px-5 py-4 border-b border-gray-100 shrink-0 bg-white z-10">
        <Link href="/mypage/scripts" className="p-1 -ml-1 hover:bg-gray-100 rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6 text-[#1A1A1A]" strokeWidth={2.5} />
        </Link>
        <h1 className="text-[17px] font-extrabold tracking-tight ml-2">멘토링 스크립트 열람</h1>
      </header>

      {/* 스크립트 본문 영역 */}
      <div className="flex-1 overflow-y-auto px-6 py-8 bg-white custom-scrollbar pb-20">
        
        <div className="flex items-center gap-2 text-[#FFCC00] mb-3">
          <FileText className="w-5 h-5" />
          <span className="text-[13px] font-extrabold tracking-tight">발행 완료 스크립트</span>
        </div>

        <p className="text-[11px] font-bold text-gray-400 tracking-wider mb-2 uppercase">Script ID: {id}</p>
        
        <h2 className="text-3xl font-extrabold text-[#1A1A1A] leading-tight mb-8">
          Mentoring Summary - Mar 25, 2026
        </h2>

        {/* 💡 편집 기능(contentEditable 등)이 모두 제거된 순수 텍스트 컨테이너입니다.
          pointer-events-none을 통해 드래그조차 불가능하게 막았습니다. 
        */}
        <div 
          ref={contentRef}
          className="mentee-view-container text-[16px] leading-[1.9] text-gray-700 whitespace-pre-wrap tracking-tight p-6 bg-[#FAFAFA] border border-gray-100 rounded-2xl pointer-events-none shadow-sm"
        />
        
        <p className="text-center text-gray-400 text-[12px] mt-8 font-medium">
          보안을 위해 일부 텍스트가 블라인드 처리되었습니다.
        </p>
      </div>
    </main>
  );
}