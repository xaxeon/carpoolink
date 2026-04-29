"use client";

// 💡 1. params Promise를 풀기 위해 React에서 'use'를 추가로 불러옵니다.
import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import { ChevronLeft, Undo2, Save, Send, Bell, MousePointer2, Grab, Eraser, EyeOff } from "lucide-react";

// 💡 2. params의 타입을 Promise로 감싸줍니다.
export default function ScriptEditPage({ params }: { params: Promise<{ id: string }> }) {
  // 💡 3. use() 훅을 사용하여 비동기 params 객체에서 id 값을 안전하게 꺼냅니다.
  const { id } = use(params);

  const [isMenteeView, setIsMenteeView] = useState(false);
  const [isPublishPopupOpen, setIsPublishPopupOpen] = useState(false);
  
  const [editMode, setEditMode] = useState<"drag" | "click">("drag");
  const [canUndo, setCanUndo] = useState(false);
  const [clickRangeStart, setClickRangeStart] = useState<Range | null>(null);
  
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = `During our session today, we discussed the strategic roadmap for the upcoming quarter. We focused on three main pillars: operational efficiency, stakeholder communication, and technical debt reduction.<br><br>I noticed that your approach to delegating tasks has improved significantly. However, you should still monitor the velocity of the secondary team when sharing the board with junior designers.`;
    }
    updateUndoState();
  }, []);

  const updateUndoState = () => {
    setCanUndo(document.queryCommandEnabled('undo'));
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
    if (!sel || sel.rangeCount === 0) return;

    if (!sel.isCollapsed) {
      setClickRangeStart(null);
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

  useEffect(() => {
    setClickRangeStart(null);
  }, [editMode]);

  return (
    <main className="flex flex-col w-full h-[100dvh] bg-white text-[#1A1A1A] font-sans overflow-hidden relative">
      
      <style>{`
        .editor-container { outline: none; }
        .editor-container ::selection { background-color: rgba(59, 130, 246, 0.4) !important; color: inherit; }
        .editor-container span[style*="background-color"] { border-radius: 3px; padding: 2px 0; }
        .editor-container span[style*="transparent"], .editor-container span[style*="rgba(0, 0, 0, 0)"] { background-color: transparent !important; }
        
        .editor-container.mentee-view span[style*="rgb(255, 204, 0)"], 
        .editor-container.mentee-view span[style*="#FFCC00"], 
        .editor-container.mentee-view span[style*="#ffcc00"] {
          color: transparent !important; background-color: #FFCC00 !important; user-select: none;
        }
      `}</style>

      <header className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0 bg-white z-10">
        <div className="flex items-center gap-3">
          {/* 뒤로 가기 버튼: 브라우저 환경을 고려해 단순 링크에서 router.back() 등을 사용할 수도 있습니다. */}
          <Link href="/mypage/scripts" className="p-1 -ml-1 hover:bg-gray-100 rounded-full transition-colors">
            <ChevronLeft className="w-6 h-6 text-[#1A1A1A]" strokeWidth={2.5} />
          </Link>
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
        <div className="flex bg-gray-200/60 p-1 rounded-xl">
          <button onClick={() => setEditMode("drag")} className={`px-4 py-1.5 text-[13px] font-bold rounded-lg transition-all flex items-center gap-1.5 ${editMode === "drag" ? 'bg-[#FFCC00] text-[#1A1A1A] shadow-sm' : 'text-gray-500'}`}>
            <Grab className="w-3.5 h-3.5" /> 드래그
          </button>
          <button onClick={() => setEditMode("click")} className={`px-4 py-1.5 text-[13px] font-bold rounded-lg transition-all flex items-center gap-1.5 ${editMode === "click" ? 'bg-[#FFCC00] text-[#1A1A1A] shadow-sm' : 'text-gray-500'}`}>
            <MousePointer2 className="w-3.5 h-3.5" /> 원클릭
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onMouseDown={(e) => e.preventDefault()} 
            onClick={() => handleAction('mask')} 
            className="bg-gray-100 text-[#1A1A1A] active:bg-gray-300 p-2 rounded-lg transition-colors shadow-sm" 
            title="선택된 영역 마스킹"
          >
            <EyeOff className="w-4 h-4" />
          </button>

          <button 
            onMouseDown={(e) => e.preventDefault()} 
            onClick={() => handleAction('erase')} 
            className="bg-gray-100 text-[#1A1A1A] active:bg-gray-300 p-2 rounded-lg transition-colors shadow-sm" 
            title="선택된 영역 마스킹 해제"
          >
            <Eraser className="w-4 h-4" />
          </button>

          <div className="h-4 w-[1px] bg-gray-300 mx-1" />
          
          <button onMouseDown={(e) => e.preventDefault()} onClick={handleUndo} disabled={!canUndo} className={`p-2 rounded-lg transition-colors ${canUndo ? 'text-gray-700 hover:bg-gray-200' : 'text-gray-300 cursor-not-allowed'}`} title="실행 취소">
            <Undo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 bg-white custom-scrollbar">
        {/* 💡 4. 위에서 use()로 꺼낸 id를 직접 사용합니다. */}
        <p className="text-[11px] font-bold text-gray-400 tracking-wider mb-2 uppercase">Script ID: {id}</p>
        
        <h2 className="text-3xl font-extrabold text-[#1A1A1A] leading-tight mb-8">
          Mentoring Summary - Mar 25, 2026
        </h2>

        <div 
          ref={editorRef}
          contentEditable={!isMenteeView}
          suppressContentEditableWarning
          onClick={handleEditorClick}
          onInput={updateUndoState}
          onKeyUp={updateUndoState}
          className={`editor-container text-[16px] leading-[1.9] text-gray-700 whitespace-pre-wrap tracking-tight transition-all p-4 -mx-4 rounded-xl
            ${isMenteeView ? 'mentee-view bg-[#FAFAFA] border border-gray-100 pointer-events-none' : 'focus:ring-2 focus:ring-[#FFCC00]/30 cursor-text'}
          `}
        />
      </div>

      <div className="w-full px-5 py-4 bg-white border-t border-gray-100 flex gap-3 shrink-0 pb-safe z-20">
        <button className="flex flex-col items-center justify-center w-20 bg-white text-gray-600 hover:bg-gray-50 rounded-2xl border border-gray-200 active:scale-95 transition-transform">
          <Save className="w-5 h-5 mb-1" />
          <span className="text-[11px] font-bold">임시 저장</span>
        </button>
        <button onClick={() => setIsPublishPopupOpen(true)} className="flex-1 bg-[#FFCC00] text-[#1A1A1A] font-extrabold text-[16px] py-4 rounded-2xl hover:bg-[#E6B800] transition-colors flex items-center justify-center gap-2 active:scale-[0.98] shadow-sm">
          <Send className="w-5 h-5" /> 발행하기
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
              발행 시 멘티에게 알림이 전송됩니다.<br />
              마스킹 처리가 완벽한지 다시 한 번 확인해 주세요.
            </p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setIsPublishPopupOpen(false)} className="flex-1 bg-[#F2F4F6] text-gray-600 font-bold py-3.5 rounded-xl transition-all hover:bg-gray-200 active:scale-95">취소</button>
              <button className="flex-1 bg-[#FFCC00] text-[#1A1A1A] font-bold py-3.5 rounded-xl shadow-sm transition-all hover:bg-[#E6B800] active:scale-95">발행</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}