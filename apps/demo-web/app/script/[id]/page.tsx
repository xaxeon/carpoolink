"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Undo2, Send, Bell, Info, Grab, Eraser, EyeOff, Loader2, X } from "lucide-react";

import apiClient from "@/lib/apiClient";

export default function ScriptEditPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [isMenteeView, setIsMenteeView] = useState(false);
  const [isPublishPopupOpen, setIsPublishPopupOpen] = useState(false);

  const [editMode, setEditMode] = useState<"drag" | "click">("drag");
  const [canUndo, setCanUndo] = useState(false);
  const [clickRangeStart, setClickRangeStart] = useState<Range | null>(null);

  const [mentoringInfo, setMentoringInfo] = useState<{ title: string; date: string, isGroup?: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);

  const [scriptList, setScriptList] = useState<any[]>([]);
  const editorRef = useRef<HTMLDivElement>(null);

  // 선언 전에 사용 오류(ts2448)를 방지하기 위해 updateUndoState 함수를 useEffect 위로 이동합니다.
  const updateUndoState = () => {
    if (typeof window === "undefined") return;
    const historyStr = sessionStorage.getItem(`script_history_${id}`);
    if (!historyStr) {
      setCanUndo(false);
      return;
    }
    try {
      const history = JSON.parse(historyStr);
      setCanUndo(history.length > 0);
    } catch {
      setCanUndo(false);
    }
  };

  // 1. 초기 데이터 로드
  useEffect(() => {
    const fetchScriptData = async () => {
      setIsLoading(true);
      try {
        const STT_SERVER_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4004";
        const res = await fetch(`${STT_SERVER_URL}/audio/stt/mentoring/${id}`);

        if (!res.ok) throw new Error(`STT 서비스 응답 실패: ${res.status}`);
        const resultData = await res.json();

        const mentoring = resultData?.mentoring;
        const scripts = resultData?.scripts || [];

        const d = mentoring?.startedAt ? new Date(mentoring.startedAt) : null;
        const dateStr = d
          ? `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`
          : "날짜 정보 없음";

        setMentoringInfo({
          title: mentoring?.title || "라이브 멘토링 스크립트",
          date: dateStr,
          isGroup: mentoring.isGroup,
        });

        // DOM에 직접 꽂는 대신 안전하게 React 상태에 담아둡니다.
        setScriptList(scripts);

      } catch (error) {
        console.error("🚨 에디터 데이터 로드 실패:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchScriptData();
  }, [id]);

  // 2. 렌더링 동기화 용 useEffect

  useEffect(() => {
    if (!isLoading && editorRef.current && scriptList.length > 0) {

      const htmlContent = scriptList.map((s: any) => {
        const scriptId = s.scriptId || String(s.id);

        let parsedContent = s.content;
        if (typeof parsedContent === 'string') {
          try { parsedContent = JSON.parse(parsedContent); } catch (e) { parsedContent = { text: parsedContent }; }
        }

        const speakerName = s.user?.nickname || s.speakerName || parsedContent?.speakerName;
        const speakerRole = s.user?.role || s.speakerRole || parsedContent?.speakerRole || "MENTEE";
        const rawTime = parsedContent?.startTime ?? s.startTime ?? parsedContent?.timestamp ?? s.timestamp;

        // 발화자 뱃지 및 타임스탬프 렌더링 로직 (기존 코드 유지)
        let speakerBadge = "";
        if (mentoringInfo?.isGroup === false && speakerName) {
          const isMentor = speakerRole === "MENTOR";
          const roleColor = isMentor ? "text-[#FFCC00] bg-[#FFCC00]/10" : "text-blue-500 bg-blue-50";
          const roleText = isMentor ? "멘토" : "멘티";
          speakerBadge = `<span class="text-[11px] font-bold ${roleColor} px-1.5 py-0.5 rounded ml-2 select-none inline-block align-middle" contenteditable="false">[${roleText}] ${speakerName}</span>`;
        }

        let timeString = "";
        if (rawTime !== undefined && rawTime !== null) {
          if (Number(rawTime) > 1000000000000) {
            const date = new Date(Number(rawTime));
            timeString = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
          } else {
            timeString = `${parseFloat(rawTime).toFixed(1)}s`;
          }
        }
        const timestampBadge = timeString ? `<span class="text-[12px] text-gray-400 font-medium ml-2 select-none inline-block align-middle" contenteditable="false">${timeString}</span>` : "";

        // 비공개 처리 (기존 코드 유지)
        if (s.isPrivate === true || String(s.isPrivate) === "true") {
          return `<div class="script-block leading-relaxed mb-1.5" data-script-id="${scriptId}" contenteditable="false"><span class="script-content text-gray-400 italic">비공개 구간 질문 및 답변입니다.</span>${speakerBadge}${timestampBadge}</div>`;
        }

        // 핵심 수정: textHTML 조립 분기 처리
        let textHTML = "";

        if (Array.isArray(parsedContent?.pieces)) {
          // 1. 이미 발행을 거쳐 pieces 세부 마스킹 데이터 구조를 가진 경우
          textHTML = parsedContent.pieces.map((p: any) => {
            const escapedText = p.text.replace(/\n/g, "<br>");
            if (p.isMasked === true || p.isMasked === "true") {
              return `<span class="masked-piece" style="background-color: #FFCC00; display: inline;">${escapedText}</span>`;
            }
            return escapedText;
          }).join("");
        } else {
          // 2. 발행 전 단일 문자열 text 구조인 경우
          const rawText = parsedContent?.text || s.text || String(parsedContent || "");
          textHTML = rawText.trim().replace(/\n/g, "<br>");

          if (s.isMasked === true || s.isMasked === "true" || parsedContent?.isMasked === true) {
            textHTML = `<span class="masked-piece" style="background-color: #FFCC00; display: inline;">${textHTML}</span>`;
          }
        }

        return `<div class="script-block leading-relaxed mb-1.5" data-script-id="${scriptId}"><span class="script-content">${textHTML}</span>${speakerBadge}${timestampBadge}</div>`;
      }).join('');

      editorRef.current.innerHTML = htmlContent;
      updateUndoState();
    }
  }, [isLoading, scriptList, mentoringInfo]);

  // 2. 스크립트 발행 (데이터 수집)
  const handlePublish = async () => {
    if (!editorRef.current || isPublishing) return;
    setIsPublishing(true);

    try {
      const scriptBlocks = editorRef.current.querySelectorAll('.script-block');
      const payloadMap = new Map<string, { text: string; isMasked: boolean }[]>();

      scriptBlocks.forEach((block) => {
        const scriptId = block.getAttribute('data-script-id');
        const contentNode = block.querySelector('.script-content');

        if (!scriptId || !contentNode) return;

        const pieces: { text: string; isMasked: boolean }[] = [];

        // 💡 [핵심 수정] 노드 탐색 함수 개선
        const parseNode = (node: Node, isCurrentlyMasked: boolean) => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent) {
              pieces.push({ text: node.textContent, isMasked: isCurrentlyMasked });
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const tag = el.tagName.toUpperCase();

            if (tag === 'BR') {
              pieces.push({ text: '\n', isMasked: isCurrentlyMasked });
              return;
            }

            // 1. 클래스명으로 마스킹 여부 체크
            const hasMaskClass = el.classList.contains('masked-piece');

            // 2. 인라인 스타일 배경색 추출 및 공백 제거 검사
            const bg = (el.style.backgroundColor || '').replace(/\s+/g, '').toLowerCase();
            const hasMaskColor =
              bg.includes('rgb(255,204,0)') ||
              bg.includes('#ffcc00') ||
              bg.includes('rgba(255,204,0'); // 알파 채널 대비

            // 부모가 마스킹 상태이거나, 현재 요소가 마스킹 클래스/컬러를 가졌다면 true
            const effectiveMask = isCurrentlyMasked || hasMaskClass || hasMaskColor;

            el.childNodes.forEach(child => parseNode(child, effectiveMask));
          }
        };

        // 💡 여기서 추가로 체크! 
        // 만약 .script-content(텍스트 감싸는 영역) 자체나 최상위 블록에 마스킹 스타일이 입혀졌을 경우를 대비합니다.
        const contentBg = (contentNode as HTMLElement).style?.backgroundColor || '';
        const normalizedContentBg = contentBg.replace(/\s+/g, '').toLowerCase();
        const isContentBlockMasked =
          normalizedContentBg.includes('rgb(255,204,0)') ||
          normalizedContentBg.includes('#ffcc00') ||
          (contentNode as HTMLElement).classList.contains('masked-piece');

        // 탐색 시작 시 기본 마스킹 상태를 위에서 검사한 결과로 설정합니다.
        contentNode.childNodes.forEach(child => parseNode(child, isContentBlockMasked));

        if (!payloadMap.has(scriptId)) {
          payloadMap.set(scriptId, pieces);
        } else {
          const existing = payloadMap.get(scriptId)!;
          existing.push(...pieces);
        }
      });

      // 이하 변환 및 전송 로직 (기존과 동일)
      const payloadScripts = Array.from(payloadMap.entries()).map(([scriptId, rawPieces]) => {
        // 1. 연속된 동일 마스킹 블록 병합 (기존 로직 유지)
        const mergedPieces = rawPieces.reduce((acc, current) => {
          if (acc.length > 0 && acc[acc.length - 1].isMasked === current.isMasked) {
            acc[acc.length - 1].text += current.text;
          } else {
            acc.push({ ...current });
          }
          return acc;
        }, [] as { text: string; isMasked: boolean }[]);

        // 2. 💡 [핵심 수정] 원본 데이터(scriptList)에서 현재 scriptId와 일치하는 원본 스크립트 찾기
        const originalScript = scriptList.find(
          (s) => String(s.scriptId || s.id) === String(scriptId)
        );

        // 3. 기존 content 객체 파싱 및 보존 처리
        let originalContent = originalScript?.content || {};
        if (typeof originalContent === 'string') {
          try {
            originalContent = JSON.parse(originalContent);
          } catch (e) {
            originalContent = {};
          }
        }

        // 4. 기존 속성(startTime, chunkIndex, endTime 등)은 유지하고, pieces만 업데이트하여 payload 조립
        return {
          scriptId: scriptId,
          content: {
            ...originalContent,
            pieces: mergedPieces
          }
        };
      });

      await apiClient.patch(`/api/scripts/${id}/publish`, { scripts: payloadScripts });

      alert("성공적으로 발행되었습니다!");
      setIsPublishPopupOpen(false);
      router.push('/mypage/scripts');

    } catch (error: any) {
      console.error("스크립트 발행 실패:", error);
      alert(error.response?.data?.message || "발행에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsPublishing(false);
    }
  };

  // 3. 에디터 키보드 제어 (Enter 줄바꿈 차단)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Enter 키의 기본 동작(줄바꿈, 블록 분리)을 완벽히 무시합니다.
      return; // 아무 작업도 수행하지 않고 종료
    }
  };

  const applyMask = (color: string) => {
    if (editorRef.current) editorRef.current.focus();
    if (!document.execCommand('hiliteColor', false, color)) {
      document.execCommand('backColor', false, color);
    }
    updateUndoState();
    setClickRangeStart(null);
  };
  const handleAction = (action: 'mask' | 'erase') => {
    if (action === 'mask') applyMask('#FFCC00');
    else if (action === 'erase') applyMask('transparent');
  };
  const handleUndo = () => {
    document.execCommand('undo');
    updateUndoState();
    setClickRangeStart(null);
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    updateUndoState();
    if (editMode !== 'click' || isMenteeView) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) {
      if (sel && !sel.isCollapsed) setClickRangeStart(null);
      return;
    }

    const currentCaret = sel.getRangeAt(0).cloneRange();

    if (!clickRangeStart) {
      setClickRangeStart(currentCaret);
    } else {
      const newRange = document.createRange();
      const cmp = clickRangeStart.compareBoundaryPoints(Range.START_TO_START, currentCaret);

      if (cmp <= 0) {
        newRange.setStart(clickRangeStart.startContainer, clickRangeStart.startOffset);
        newRange.setEnd(currentCaret.endContainer, currentCaret.endOffset);
      } else {
        newRange.setStart(currentCaret.startContainer, currentCaret.startOffset);
        newRange.setEnd(clickRangeStart.endContainer, clickRangeStart.endOffset);
      }

      sel.removeAllRanges();
      sel.addRange(newRange);
      setClickRangeStart(null);
    }
  };

  useEffect(() => { setClickRangeStart(null); }, [editMode]);

  return (
    <main className="flex flex-col w-full h-[100dvh] bg-white text-[#1A1A1A] font-sans overflow-hidden relative">

      <style>{`
        .editor-container { outline: none; }
        .editor-container ::selection { background-color: rgba(59, 130, 246, 0.4) !important; color: inherit; }
        .editor-container span[style*="background-color"], .editor-container .masked-piece { background-color: rgb(255, 204, 0) !important; border-radius: 3px; padding: 2px 0; }
        .editor-container span[style*="transparent"], .editor-container span[style*="rgba(0, 0, 0, 0)"] { background-color: transparent !important; }
        
        .editor-container.mentee-view span[style*="rgb(255, 204, 0)"], 
        .editor-container.mentee-view span[style*="#FFCC00"], 
        .editor-container.mentee-view .masked-piece {
          color: transparent !important; background-color: #FFCC00 !important; user-select: none;
        }
      `}</style>

      <header className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1 -ml-1 hover:bg-gray-100 rounded-full transition-colors">
            <ChevronLeft className="w-6 h-6 text-[#1A1A1A]" strokeWidth={2.5} />
          </button>
          <h1 className="text-[17px] font-extrabold tracking-tight">스크립트 편집 & 리뷰</h1>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-gray-500">멘티 뷰 보기</span>
          <button onClick={() => setIsMenteeView(!isMenteeView)} className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 ${isMenteeView ? 'bg-[#FFCC00]' : 'bg-gray-200'}`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${isMenteeView ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </header>

      <div className={`flex items-center justify-between px-5 py-3 border-b border-gray-100 border-dashed bg-[#FAFAFA] shrink-0 transition-all duration-300 overflow-hidden
        ${isMenteeView ? 'max-h-0 opacity-0 py-0' : 'max-h-20 opacity-100'}
      `}>
        <div className="`px-4 py-1.5 text-[13px] rounded-lg transition-all flex items-center gap-1.5 text-gray-500">
          <Info className="w-4 h-4" />민감한 정보는 드래그하여 가릴 수 있습니다.
        </div>

        <div className="flex items-center gap-2">
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => handleAction('mask')} className="bg-gray-100 text-gray-500 text-[12px] active:bg-gray-300 p-2 rounded-lg transition-colors shadow-sm" title="선택된 영역 마스킹">
            <Eraser className="w-4 h-4" />
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => handleAction('erase')} className="bg-gray-100 text-gray-500 text-[12px] active:bg-gray-300 p-2 rounded-lg transition-colors shadow-sm" title="선택된 영역 마스킹 해제">
            <Undo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 bg-white custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-[#FFCC00] animate-spin" />
            <p className="text-[14px] text-gray-400">데이터를 불러오는 중입니다...</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-bold text-gray-400 tracking-wider mb-2 uppercase"></p>
            <h2 className="text-[26px] font-extrabold text-[#1A1A1A] leading-tight mb-8">
              {mentoringInfo?.title}
              <span className="block text-[15px] font-medium text-gray-400 mt-2 tracking-normal">{mentoringInfo?.date}</span>
            </h2>

            <div
              ref={editorRef}
              contentEditable={!isMenteeView}
              suppressContentEditableWarning
              onClick={handleEditorClick}
              onInput={updateUndoState}
              onKeyDown={handleKeyDown}
              onKeyUp={updateUndoState}
              className={`editor-container text-[16px] leading-[1.9] text-gray-700 whitespace-pre-wrap tracking-tight transition-all p-4 -mx-4 rounded-xl
                ${isMenteeView ? 'mentee-view bg-[#FAFAFA] border border-gray-100 pointer-events-none' : 'focus:ring-2 focus:ring-[#FFCC00]/30 cursor-text'}
              `}
            />
          </>
        )}
      </div>

      <div className="w-full px-5 py-4 bg-white border-t border-gray-100 flex shrink-0 pb-safe z-20">
        <button
          onClick={() => setIsPublishPopupOpen(true)}
          disabled={isPublishing}
          className={`flex-1 bg-[#FFCC00] text-[#1A1A1A] font-extrabold text-[16px] py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-sm
            ${isPublishing ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#E6B800] active:scale-[0.98]'}
          `}
        >
          {isPublishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          {isPublishing ? '발행 중...' : '발행하기'}
        </button>
      </div>

      {isPublishPopupOpen && (
        <div className="absolute inset-0 bg-black/60 z-[100] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-[320px] rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 flex flex-col items-center">
            <div className="bg-[#FFCC00] w-16 h-16 rounded-full flex items-center justify-center mb-5 shadow-inner">
              <Bell className="w-8 h-8 text-[#1A1A1A]" fill="currentColor" />
            </div>
            <h3 className="text-[19px] font-extrabold text-center mb-3">정말 발행하시겠습니까?</h3>
            <p className="text-gray-500 text-[13px] text-center mb-8 leading-relaxed">
              발행 시 멘티에게 알림이 전송되며<br />더 이상 스크립트를 <b>수정할 수 없습니다.</b>
            </p>
            <div className="flex gap-3 w-full">
              <button
                disabled={isPublishing}
                onClick={() => setIsPublishPopupOpen(false)}
                className="flex-1 bg-[#F2F4F6] text-gray-600 font-bold py-3.5 rounded-xl transition-all hover:bg-gray-200 active:scale-95"
              >
                취소
              </button>
              <button
                disabled={isPublishing}
                onClick={handlePublish}
                className="flex-1 bg-[#FFCC00] text-[#1A1A1A] font-bold py-3.5 rounded-xl shadow-sm transition-all hover:bg-[#E6B800] active:scale-95 flex justify-center items-center"
              >
                {isPublishing ? <Loader2 className="w-5 h-5 animate-spin" /> : "발행"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}