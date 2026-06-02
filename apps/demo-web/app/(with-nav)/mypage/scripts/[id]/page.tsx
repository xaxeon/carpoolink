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
  const [mentoringInfo, setMentoringInfo] = useState<{ title: string; date: string; isGroup?: boolean } | null>(null);
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
          isGroup: mentoring.isGroup,
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

      let htmlContent = "";
      let inPrivateBlock = false;

      scriptList.forEach((s: any, index: number) => {
        const parsedContent = s.content;
        const speakerName = s.speaker?.nickname;
        const speakerRole = s.speaker?.role || "MENTEE";
        const rawTime = parsedContent?.startTime ?? s.createdAt;

        // 발화자 뱃지 구성
        let speakerBadge = "";
        if (speakerName) {
          const isMentor = speakerRole === "MENTOR";
          const roleColor = isMentor ? "text-[#FFCC00] bg-[#FFCC00]/10" : "text-blue-500 bg-blue-50";
          const roleText = isMentor ? "멘토" : "멘티";
          speakerBadge = `<span class="text-[11px] font-bold ${roleColor} px-1.5 py-0.5 rounded ml-2 select-none inline-block align-middle">[${roleText}] ${speakerName}</span>`;
        }

        // 타임스탬프 계산
        let timeString = "";
        if (rawTime) {
          const numTime = Number(rawTime);
          if (!isNaN(numTime) && numTime < 1000000000000) {
            timeString = `${parseFloat(rawTime).toFixed(1)}s`;
          } else {
            const date = new Date(rawTime);
            timeString = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
          }
        }
        const timestampBadge = timeString
          ? `<span class="text-[12px] text-amber-400 font-medium ml-2 select-none inline-block align-middle">${timeString}</span>`
          : "";

        // 메인 텍스트 파싱
        let textHTML = "";
        let rawTextForCondition = "";

        if (parsedContent?.pieces && Array.isArray(parsedContent.pieces)) {
          textHTML = parsedContent.pieces.map((piece: any) => {
            rawTextForCondition += piece.text || "";
            if (piece.isMasked) {
              return `<span style="background-color: #FFCC00">${piece.text}</span>`;
            }
            return piece.text || "";
          }).join('');
        } else {
          // pieces가 없는 예외/과거 데이터 처리용
          rawTextForCondition = parsedContent?.text || "";
          textHTML = rawTextForCondition;
        }

        // 💡 화면 표시용 텍스트 가공: 안내 문구를 화면에서 지웁니다.
        textHTML = textHTML.replace("(질문 읽기) 비공개 질문입니다.", "").trim();
        textHTML = textHTML.replace(/\n/g, "<br>");

        // 💡 비공개 구간 시작 여부 판별
        const isStartOfPrivateText = rawTextForCondition.trim().startsWith("(질문 읽기) 비공개 질문입니다.");
        const isCurrentlyPrivate = s.isPrivate === true || String(s.isPrivate) === "true";

        const isUnauthorized = isCurrentlyPrivate && rawTextForCondition === ("비공개 질문 및 답변입니다.");

        if (isUnauthorized) {
          htmlContent += `<div class="my-3 leading-relaxed text-gray-400 italic text-sm font-normal flex items-center select-none">비공개 질문 구간입니다.</div>`;
        } else {
          if (isStartOfPrivateText || (isCurrentlyPrivate && !inPrivateBlock)) {
            if (inPrivateBlock) {
              htmlContent += `</div></div>`; // 기존 블록 닫기
            }
            inPrivateBlock = true;

            // 비공개 구간 디자인 (편집 화면과 동일한 회색 박스와 뱃지)
            htmlContent += `<div class="private-section bg-gray-100 border border-gray-100 rounded-lg p-4 pt-11 my-6 relative transition-colors"><span class="absolute top-2 left-2 text-[11px] font-bold text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded select-none inline-block" contenteditable="false">비공개 질문 구간</span><div class="private-content-inner space-y-1.5">`;
          }

          // 텍스트가 비어있지 않거나(안내 문구 제외 후), 비공개 안내 문구인 경우에만 렌더링
          if (textHTML.length > 0 || isCurrentlyPrivate) {
            htmlContent += `<div class="mb-1.5 leading-relaxed"><span>${textHTML}</span>${speakerBadge}${timestampBadge}</div>`;
          }

          // 💡 비공개 구간 종료 여부 판별
          const nextScript = scriptList[index + 1];
          let nextIsPrivateText = false;
          let nextIsPrivateFlag = false;

          if (nextScript) {
            const nextParsedContent = nextScript.content;
            let nextRawText = "";
            if (nextParsedContent?.pieces && Array.isArray(nextParsedContent.pieces)) {
              nextRawText = nextParsedContent.pieces.map((p: any) => p.text).join("");
            } else {
              nextRawText = nextParsedContent?.text || "";
            }

            nextIsPrivateText = nextRawText.trim().startsWith("(질문 읽기) 비공개 질문입니다.");
            nextIsPrivateFlag = nextScript.isPrivate === true || String(nextScript.isPrivate) === "true";
          }

          const shouldClosePrivateBlock = inPrivateBlock && (
            !nextScript ||
            (!nextIsPrivateFlag && !nextIsPrivateText) ||
            nextIsPrivateText
          );

          if (shouldClosePrivateBlock) {
            htmlContent += `</div></div>`; // Wrapper 닫기
            inPrivateBlock = false;
          }
        }
      });

      contentRef.current.innerHTML = htmlContent;
    }
  }, [isLoading, scriptList, mentoringInfo]);

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
              className="mentee-view-container text-[16px] leading-[1.9] text-gray-700 whitespace-pre-wrap tracking-tight p-6 border border-gray-100 rounded-lg pointer-events-none shadow-sm"
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