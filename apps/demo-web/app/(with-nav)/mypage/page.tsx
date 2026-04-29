"use client";

import Link from "next/link";
import { 
  Settings, 
  ChevronRight, 
  UserPen, 
  BadgeCheck, 
  ClipboardList, 
  Star, 
  ScrollText, 
  HelpCircle, 
  MessageSquare 
} from "lucide-react";

export default function MyPage() {
  return (
    <main className="flex flex-col w-full bg-white text-[#1A1A1A] font-sans min-h-[100dvh] pb-[80px]">
      
      {/* 1. 상단 헤더 */}
      <header className="flex items-center justify-between px-5 py-4 sticky top-0 bg-white z-20">
        <h1 className="text-[22px] font-bold tracking-tight">마이페이지</h1>
        <button className="p-1 hover:bg-gray-100 rounded-full transition-colors">
          <Settings className="w-6 h-6" strokeWidth={2} />
        </button>
      </header>

      {/* 2. 멘티 프로필 영역 */}
      <div className="flex items-center gap-4 px-5 py-6">
        {/* 멘티 로고 아이콘 */}
        <div className="w-[72px] h-[72px] bg-[#111116] rounded-2xl flex flex-col items-center justify-center text-white shrink-0 shadow-sm">
          <span className="text-[15px] font-extrabold mb-1">멘티</span>
          <span className="text-[10px] font-bold tracking-widest">—O—O—</span>
        </div>
        
        {/* 💡 수정됨: flex-col 대신 flex items-center를 사용하여 닉네임과 뱃지를 가로로 배치합니다. */}
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-semibold tracking-tight">김세종</h2>
          <span className="inline-block bg-[#FFCC00] text-black text-[12px] font-semibold px-2.5 py-1 rounded-md w-fit">
            창의적인 모험가
          </span>
        </div>
      </div>

      {/* 3. 사전 질문권 개수 영역 */}
      <div className="mx-5 mb-8 bg-[#F8F9FA] rounded-2xl p-4 flex items-center justify-between border border-gray-100 shadow-sm">
        <span className="text-[15px] font-bold text-gray-700 ml-1">사전 질문권 개수</span>
        <div className="flex items-center gap-3">
          <span className="text-[18px] font-extrabold">5 <span className="text-[14px] font-medium text-gray-500">개</span></span>
          <button className="bg-[#333333] hover:bg-black text-white text-[13px] font-bold px-4 py-2 rounded-lg transition-colors active:scale-95">
            충전
          </button>
        </div>
      </div>

      {/* 4. 메인 메뉴 리스트 */}
      <div className="flex flex-col px-5 mb-6">
        <Link href="#" className="flex items-center justify-between py-4 group">
          <div className="flex items-center gap-3">
            <UserPen className="w-[22px] h-[22px] text-gray-500 group-hover:text-[#1A1A1A] transition-colors" strokeWidth={2} />
            <span className="text-[16px] font-medium group-hover:font-bold transition-all">멘티프로필 수정</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </Link>

        <Link href="#" className="flex items-center justify-between py-4 group">
          <div className="flex items-center gap-3">
            <BadgeCheck className="w-[22px] h-[22px] text-gray-500 group-hover:text-[#1A1A1A] transition-colors" strokeWidth={2} />
            <span className="text-[16px] font-medium group-hover:font-bold transition-all">멘토 등록</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </Link>

        <Link href="#" className="flex items-center justify-between py-4 group">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-[22px] h-[22px] text-gray-500 group-hover:text-[#1A1A1A] transition-colors" strokeWidth={2} />
            <span className="text-[16px] font-medium group-hover:font-bold transition-all">멘토링 진행내역</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </Link>

        <Link href="#" className="flex items-center justify-between py-4 group">
          <div className="flex items-center gap-3">
            <Star className="w-[22px] h-[22px] text-gray-500 group-hover:text-[#1A1A1A] transition-colors" strokeWidth={2} />
            <span className="text-[16px] font-medium group-hover:font-bold transition-all">리뷰 관리</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </Link>

        <Link href="/mypage/scripts" className="flex items-center justify-between py-4 group">
          <div className="flex items-center gap-3">
            <ScrollText className="w-[22px] h-[22px] text-gray-500 group-hover:text-[#1A1A1A] transition-colors" strokeWidth={2} />
            <span className="text-[16px] font-medium group-hover:font-bold transition-all">스크립트 목록</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </Link>
      </div>

      {/* 구분선 */}
      <div className="w-full h-[8px] bg-[#F8F9FA]" />

      {/* 5. 서브 메뉴 리스트 */}
      <div className="flex flex-col px-5 mt-4">
        <Link href="#" className="flex items-center justify-between py-4 group">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-[22px] h-[22px] text-gray-500 group-hover:text-[#1A1A1A] transition-colors" strokeWidth={2} />
            <span className="text-[16px] font-medium group-hover:font-bold transition-all">서비스 이용 안내</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </Link>

        <Link href="#" className="flex items-center justify-between py-4 group">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-[22px] h-[22px] text-gray-500 group-hover:text-[#1A1A1A] transition-colors" strokeWidth={2} />
            <span className="text-[16px] font-medium group-hover:font-bold transition-all">1:1 문의</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </Link>
      </div>

    </main>
  );
}