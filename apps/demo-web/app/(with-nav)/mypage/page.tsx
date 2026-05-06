"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  MessageSquare,
  LogOut // 💡 1. 로그아웃 아이콘 추가 임포트
} from "lucide-react";

import apiClient from "@/lib/apiClient"; 

interface UserProfile {
  nickname: string;
  remainingTickets: number; 
  surveyType: string;       
}

export default function MyPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      alert("로그인이 필요한 서비스입니다.");
      router.push("/login"); 
      return;
    }

    const fetchUserData = async () => {
      try {
        const userRes = await apiClient.get("/users/me");
        
        // 💡 수정된 부분: 백엔드 응답 구조(menteeProfile)에 맞게 경로와 변수명을 변경했습니다.
        setUser({
          nickname: userRes.data.nickname || "사용자",
          // tickets 대신 menteeProfile.balance 사용
          remainingTickets: userRes.data.menteeProfile?.balance ?? 0, 
          // surveyType 대신 menteeProfile.surveyResult 사용
          surveyType: userRes.data.menteeProfile?.surveyResult ?? "유형 없음", 
        });
      } catch (error) {
        console.error("마이페이지 데이터 호출 실패:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [router]);

  // 💡 2. 로그아웃 처리 함수 추가
  const handleLogout = () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      // 로컬 스토리지에 있는 인증 정보(신분증) 모두 삭제
      localStorage.removeItem("userId");
      localStorage.removeItem("accessToken"); // 토큰이 있다면 함께 삭제
      
      // 로그인 페이지로 이동
      router.push("/login");
    }
  };

  if (isLoading || !user) {
    return (
      <main className="flex flex-col w-full bg-white text-[#1A1A1A] font-sans min-h-[100dvh] pb-[80px] items-center justify-center">
        <p className="text-gray-500 font-medium">데이터를 불러오는 중입니다... ⏳</p>
      </main>
    );
  }

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
        <div className="w-[72px] h-[72px] bg-[#111116] rounded-2xl flex flex-col items-center justify-center text-white shrink-0 shadow-sm">
          <span className="text-[15px] font-extrabold mb-1">멘티</span>
          <span className="text-[10px] font-bold tracking-widest">—O—O—</span>
        </div>
        
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-semibold tracking-tight">{user.nickname}</h2>
          
          {user.surveyType !== "유형 없음" && (
            <span className="inline-block bg-[#FFCC00] text-black text-[12px] font-semibold px-2.5 py-1 rounded-md w-fit">
              {user.surveyType}
            </span>
          )}
        </div>
      </div>

      {/* 3. 사전 질문권 개수 영역 */}
      <div className="mx-5 mb-8 bg-[#F8F9FA] rounded-2xl p-4 flex items-center justify-between border border-gray-100 shadow-sm">
        <span className="text-[15px] font-bold text-gray-700 ml-1">사전 질문권 개수</span>
        <div className="flex items-center gap-3">
          <span className="text-[18px] font-extrabold">
            {user.remainingTickets} <span className="text-[14px] font-medium text-gray-500">개</span>
          </span>
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

        {/* 💡 3. 로그아웃 버튼 (서브 메뉴 하단에 추가) */}
        <button 
          onClick={handleLogout} 
          className="flex items-center justify-between py-4 group w-full text-left"
        >
          <div className="flex items-center gap-3">
            <LogOut className="w-[22px] h-[22px] text-red-500 group-hover:text-red-600 transition-colors" strokeWidth={2} />
            <span className="text-[16px] font-medium text-red-500 group-hover:text-red-600 transition-all">로그아웃</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </button>
      </div>

    </main>
  );
}