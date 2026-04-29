"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, FileText, Calendar, User, Users, ChevronRight, Edit3, CheckCircle2 } from "lucide-react";

const MOCK_SCRIPTS = {
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
  const [activeTab, setActiveTab] = useState<"1:1" | "1:N">("1:1");
  const [userRole, setUserRole] = useState<"MENTEE" | "MENTOR">("MENTEE");

  const currentScripts = activeTab === "1:1" ? MOCK_SCRIPTS.ONE_ON_ONE : MOCK_SCRIPTS.ONE_TO_N;

  const handleScriptClick = (scriptId: number, isPublished: boolean) => {
    if (userRole === "MENTOR" && !isPublished) {
      // 1. 멘토이면서, 아직 발행되지 않은 스크립트 ("편집 필요")
      // 💡 하드코딩되었던 100 대신, 실제 클릭한 scriptId로 이동하도록 수정했습니다.
      router.push(`/script/${scriptId}`); 
    } else {
      // 2. 멘티이거나, 이미 발행된 스크립트
      router.push(`/mypage/scripts/${scriptId}`); 
    }
  };

  return (
    <main className="flex flex-col w-full bg-white text-[#1A1A1A] font-sans min-h-[100dvh] pb-[80px]">
      
      <header className="flex items-center px-2 py-4 sticky top-0 bg-white z-20 border-b border-gray-50">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6" strokeWidth={2.5} />
        </button>
        <h1 className="text-[18px] font-bold ml-1">스크립트 목록</h1>
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
        <button 
          onClick={() => setActiveTab("1:1")}
          className={`flex-1 py-4 text-[15px] font-bold transition-all relative ${activeTab === "1:1" ? "text-[#1A1A1A]" : "text-gray-400"}`}
        >
          1:1 멘토링
          {activeTab === "1:1" && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#1A1A1A]" />}
        </button>
        <button 
          onClick={() => setActiveTab("1:N")}
          className={`flex-1 py-4 text-[15px] font-bold transition-all relative ${activeTab === "1:N" ? "text-[#1A1A1A]" : "text-gray-400"}`}
        >
          1:N 멘토링
          {activeTab === "1:N" && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#1A1A1A]" />}
        </button>
      </div>

      <div className="flex flex-col p-5 gap-4">
        {currentScripts.length > 0 ? (
          currentScripts.map((script) => (
            <div 
              key={script.id} 
              onClick={() => handleScriptClick(script.id, script.isPublished)}
              className="flex flex-col bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {activeTab === "1:1" ? (
                    <div className={`w-10 h-10 rounded-full ${(script as any).profileColor} flex items-center justify-center text-white`}>
                      <User className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className={`w-10 h-10 rounded-lg ${(script as any).thumbnailColor} flex items-center justify-center text-white`}>
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
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <FileText className="w-12 h-12 text-gray-100 mb-4" />
            <p className="text-gray-400 font-bold text-[15px]">저장된 스크립트가 없습니다.</p>
          </div>
        )}
      </div>

    </main>
  );
}