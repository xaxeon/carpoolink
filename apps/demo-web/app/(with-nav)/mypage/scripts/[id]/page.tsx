"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, AlertCircle } from "lucide-react";
import apiClient from "@/lib/apiClient";

export default function PublishedScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scriptList, setScriptList] = useState<any[]>([]);

  // API 연동 상태 관리
  const [mentoringInfo, setMentoringInfo] = useState<{ title: string; date: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. 초기 데이터 페치 (상태값 보관 역할)
  useEffect(() => {
    const fetchScriptData = async () => {
      setIsLoading(true);
      try {
        const res = await apiClient.get(`/api/scripts/${id}`);
        const { mentoring, scripts } = res.data;

        const d = mentoring.startedAt ? new Date(mentoring.startedAt) : null;
        const dateStr = d 
          ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
          : "날짜 미상";

        setMentoringInfo({
          title: mentoring.title,
          date: dateStr,
        });

        // DOM을 직접 찌르지 않고 React 상태에 데이터를 안전하게 기록합니다.
        setScriptList(scripts || []);

      } catch (err) {
        console.error("스크립트 열람 실패:", err);
        setError("스크립트를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchScriptData();
    }
  }, [id]);

  // 2. 로딩이 종료되어 contentRef가 확실하게 DOM에 로드된 타이밍에 HTML 주입
  useEffect(() => {
    if (!isLoading && contentRef.current && scriptList.length > 0) {
      const htmlContent = scriptList.map((s: any) => {
        const timestamp = s.content?.timestamp 
          ? `<span class="text-[12px] text-gray-400 font-medium ml-2 select-none">${s.content.timestamp}</span>` 
          : "";

        let textHTML = "";

        // 비공개 처리 분기
        if (s.content?.isPrivate || s.isPrivate) {
          const privateText = s.content?.text || "비공개 질문입니다.";
          return `<div class="text-gray-400 italic">🔒 <span>${privateText}</span>${timestamp}</div>`;
        }

        // 부분 마스킹 배열(pieces) 처리
        if (s.content?.pieces && Array.isArray(s.content.pieces)) {
          textHTML = s.content.pieces.map((piece: any) => {
            if (piece.isMasked) {
              return `<span style="background-color: #FFCC00">${piece.text || "마스킹된 부분입니다."}</span>`;
            }
            return piece.text || "";
          }).join('');
        } 
        // 통문장 마스킹 처리
        else {
          textHTML = s.content?.text || s.content?.message || "";
          if (s.masked || s.isMasked || s.content?.isMasked) {
            textHTML = `<span style="background-color: #FFCC00">${textHTML}</span>`;
          }
        }

        return `<div><span>${textHTML}</span>${timestamp}</div>`;
      }).join('');

      contentRef.current.innerHTML = htmlContent;
    }
  }, [isLoading, scriptList]);

  return (
    <main className="flex flex-col w-full h-[100dvh] bg-white text-[#1A1A1A] font-sans overflow-hidden relative">
      
      {/* 멘티 뷰 CSS 로직 (마스킹된 텍스트 글자색 투명화 및 블라인드 처리) */}
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
        <button 
          onClick={() => router.back()} 
          className="p-1 -ml-1 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-[#1A1A1A]" strokeWidth={2.5} />
        </button>
        <h1 className="text-[17px] font-extrabold tracking-tight ml-2">멘토링 스크립트 열람</h1>
      </header>

      {/* 스크립트 본문 영역 */}
      <div className="flex-1 overflow-y-auto px-6 py-8 bg-white custom-scrollbar pb-20">
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <Loader2 className="w-8 h-8 text-[#FFCC00] animate-spin" />
            <p className="text-[14px] text-gray-400 font-medium">스크립트를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3 text-center">
            <AlertCircle className="w-10 h-10 text-gray-300" />
            <p className="text-[14px] text-gray-500 font-bold">{error}</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-bold text-gray-400 tracking-wider mb-2 uppercase">Mentoring ID: {id}</p>
            
            <h2 className="text-3xl font-extrabold text-[#1A1A1A] leading-tight mb-8">
              {mentoringInfo?.title}
              <span className="block text-[15px] font-medium text-gray-400 mt-2 tracking-normal">{mentoringInfo?.date}</span>
            </h2>

            {/* 편집 기능이 제거된 순수 텍스트 컨테이너 (포인터 이벤트 막음) */}
            <div 
              ref={contentRef}
              className="mentee-view-container text-[16px] leading-[1.9] text-gray-700 whitespace-pre-wrap tracking-tight p-6 bg-[#FAFAFA] border border-gray-100 rounded-2xl pointer-events-none shadow-sm"
            />
            
            <p className="text-center text-gray-400 text-[12px] mt-8 font-medium">
              보안을 위해 일부 텍스트가 블라인드 처리되었습니다.
            </p>
          </>
        )}
      </div>
    </main>
  );
}