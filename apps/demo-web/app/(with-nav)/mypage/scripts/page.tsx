"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, FileText, Calendar, User, Users, ChevronRight, Edit3, CheckCircle2, Search } from "lucide-react";

// 💡 1. 1:1 스크립트와 1:N 스크립트를 아우르는 공통 타입을 정의합니다.
type ScriptItem = {
  id: number;
  mentorName: string;
  topic: string;
  date: string;
  isPublished: boolean;
  profileColor?: string;     // 1:1 전용 속성 (선택적)
  thumbnailColor?: string;   // 1:N 전용 속성 (선택적)
};

// 💡 2. MOCK_SCRIPTS 객체에 방금 만든 타입을 명시해 줍니다.
const MOCK_SCRIPTS: { ONE_ON_ONE: ScriptItem[]; ONE_TO_N: ScriptItem[] } = {
  ONE_ON_ONE: [
    {
      id: 1,
      mentorName: "AI네이티브개발자",
      topic: "백엔드 신입 포트폴리오 전략",
      date: "2026. 04. 25",
      profileColor: "bg-blue-500",
      isPublished: true, 
    },
    {
      id: 2,
      mentorName: "프론트엔드장인",
      topic: "React 성능 최적화 심화 멘토링",
      date: "2026. 04. 28",
      profileColor: "bg-emerald-500",
      isPublished: false, 
    },
  ],
  ONE_TO_N: [
    {
      id: 101,
      mentorName: "게임개발자K",
      topic: "Unreal Engine 5 구조 설계 노하우 라이브",
      date: "2026. 04. 20",
      thumbnailColor: "bg-purple-900",
      isPublished: true,
    },
    {
      id: 102,
      mentorName: "기획왕",
      topic: "주니어 PM을 위한 데이터 지표 읽기",
      date: "2026. 04. 27",
      thumbnailColor: "bg-orange-900",
      isPublished: false,
    }
  ]
};

export default function ScriptListPage() {
  const router = useRouter();
  
  // 상태 관리
  const [activeTab, setActiveTab] = useState<"1:1" | "1:N">("1:1");
  const [userRole, setUserRole] = useState<"MENTEE" | "MENTOR">("MENTEE");
  
  // 💡 검색 및 정렬을 위한 상태 추가
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // 💡 데이터 필터링 및 정렬 로직 (useMemo로 최적화)
  const processedScripts = useMemo(() => {
    let list = activeTab === "1:1" ? MOCK_SCRIPTS.ONE_ON_ONE : MOCK_SCRIPTS.ONE_TO_N;

    // 1. 검색어 필터링 (주제 제목 기준)
    if (searchQuery.trim() !== "") {
      list = list.filter(script => 
        script.topic.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 2. 날짜 정렬
    list = [...list].sort((a, b) => {
      // "2026. 04. 25" 형식을 "2026-04-25" 형식으로 변환하여 안전하게 Date 객체로 만듭니다.
      const dateA = new Date(a.date.split(". ").join("-")).getTime();
      const dateB = new Date(b.date.split(". ").join("-")).getTime();
      
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return list;
  }, [activeTab, searchQuery, sortOrder]);

  const handleScriptClick = (scriptId: number, isPublished: boolean) => {
    if (userRole === "MENTOR" && !isPublished) {
      router.push(`/script/${scriptId}`); 
    } else if (isPublished) {
      router.push(`/mypage/scripts/${scriptId}`); 
    }
  };

  return (
    <main className="flex flex-col w-full bg-white text-[#1A1A1A] font-sans min-h-[100dvh] pb-[80px]">
      
      {/* 💡 헤더 - 검색 버튼 및 검색창 입력 UI 추가 */}
      <header className="flex items-center justify-between px-2 py-4 sticky top-0 bg-white z-20 border-b border-gray-50">
        {!isSearchOpen ? (
          <>
            <div className="flex items-center">
              <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <ChevronLeft className="w-6 h-6" strokeWidth={2.5} />
              </button>
              <h1 className="text-[18px] font-bold ml-1">스크립트 목록</h1>
            </div>
            <button onClick={() => setIsSearchOpen(true)} className="p-2 hover:bg-gray-100 rounded-full mr-2 transition-colors">
              <Search className="w-5 h-5" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 w-full animate-in slide-in-from-right-4 duration-300 px-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={2.5} />
              <input 
                autoFocus
                type="text"
                placeholder="스크립트 제목 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-100 py-2 pl-10 pr-4 rounded-xl text-[14px] font-medium outline-none"
              />
            </div>
            <button 
              onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }} 
              className="text-[14px] font-bold text-gray-500 whitespace-nowrap"
            >
              취소
            </button>
          </div>
        )}
      </header>

      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-[13px] font-bold text-gray-500">현재 접속 계정 테스트</span>
        <div className="flex bg-gray-200 p-1 rounded-lg">
          <button 
            onClick={() => setUserRole("MENTEE")}
            className={`px-3 py-1 text-[12px] font-bold rounded-md transition-all ${userRole === "MENTEE" ? "bg-white shadow-sm" : "text-gray-500"}`}
          >
            멘티 모드
          </button>
          <button 
            onClick={() => setUserRole("MENTOR")}
            className={`px-3 py-1 text-[12px] font-bold rounded-md transition-all ${userRole === "MENTOR" ? "bg-[#1A1A1A] text-[#FFCC00] shadow-sm" : "text-gray-500"}`}
          >
            멘토 모드
          </button>
        </div>
      </div>

      <div className="flex w-full border-b border-gray-100">
        <button onClick={() => {setActiveTab("1:1"); setSearchQuery("");}} className={`flex-1 py-4 text-[15px] font-bold transition-all relative ${activeTab === "1:1" ? "text-[#1A1A1A]" : "text-gray-400"}`}>
          1:1 멘토링
          {activeTab === "1:1" && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#1A1A1A]" />}
        </button>
        <button onClick={() => {setActiveTab("1:N"); setSearchQuery("");}} className={`flex-1 py-4 text-[15px] font-bold transition-all relative ${activeTab === "1:N" ? "text-[#1A1A1A]" : "text-gray-400"}`}>
          1:N 멘토링
          {activeTab === "1:N" && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#1A1A1A]" />}
        </button>
      </div>

      {/* 💡 정렬 셀렉트 박스 및 결과 건수 */}
      <div className="flex items-center justify-between px-5 py-3 mt-1">
        <span className="text-[13px] font-bold text-gray-500">
          총 {processedScripts.length}건
        </span>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
          className="text-[13px] font-extrabold text-[#1A1A1A] bg-transparent outline-none cursor-pointer p-1"
        >
          <option value="newest">최신순</option>
          <option value="oldest">오래된순</option>
        </select>
      </div>

      {/* 리스트 렌더링 (processedScripts 사용) */}
      <div className="flex flex-col px-5 pb-5 gap-4">
        {processedScripts.length > 0 ? (
          processedScripts.map((script) => {
            const isMenteeWaiting = userRole === "MENTEE" && !script.isPublished;

            return (
              <div 
                key={script.id} 
                onClick={() => !isMenteeWaiting && handleScriptClick(script.id, script.isPublished)}
                className={`flex flex-col bg-white border border-gray-100 rounded-2xl p-5 shadow-sm transition-all
                  ${isMenteeWaiting ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:shadow-md active:scale-[0.98]'}
                `}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {activeTab === "1:1" ? (
                      <div className={`w-10 h-10 rounded-full ${script.profileColor} flex items-center justify-center text-white shrink-0`}>
                        <User className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className={`w-10 h-10 rounded-lg ${script.thumbnailColor} flex items-center justify-center text-white shrink-0`}>
                        <Users className="w-5 h-5" />
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-[13px] font-bold text-gray-400">{script.mentorName} 멘토</span>
                      <h3 className="text-[16px] font-bold leading-snug mt-0.5">{script.topic}</h3>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                  <div className="flex items-center gap-3 text-[12px] font-medium text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {script.date}
                    </div>
                    
                    {script.isPublished ? (
                      <div className="flex items-center gap-1 text-green-600 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        발행 완료
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[#FFCC00] font-bold">
                        <Edit3 className="w-3.5 h-3.5" />
                        {userRole === "MENTOR" ? "편집 필요" : "발행 대기중"}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <FileText className="w-12 h-12 text-gray-100 mb-4" />
            <p className="text-gray-400 font-bold text-[15px]">조건에 맞는 스크립트가 없습니다.</p>
          </div>
        )}
      </div>

    </main>
  );
}