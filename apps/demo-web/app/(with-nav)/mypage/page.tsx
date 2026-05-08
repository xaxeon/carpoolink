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
  LogOut,
  RefreshCw // 💡 1. 재시작 아이콘 추가
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
        const userRes = await apiClient.get("/api/users/me");
        setUser({
          nickname: userRes.data.nickname || "사용자",
          remainingTickets: userRes.data.menteeProfile?.balance ?? 0,
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

  // 💡 2. 설문 데이터 초기화 및 다시하기 로직
  const handleRetakeSurvey = async () => {
    if (window.confirm("기존 설문 결과가 초기화됩니다. 다시 테스트하시겠습니까?")) {
      try {
        // ※ 현재 백엔드에 별도의 reset API가 없다면,
        // 단순히 페이지 이동 후 새로운 결과를 제출(POST)할 때 덮어씌워지게 됩니다.
        // 만약 즉시 초기화가 필요하다면 백엔드에 PATCH /api/users/me (surveyResultId: null) 등을 요청해야 합니다.

        // 로컬에 남아있을 수 있는 이전 결과 캐시 삭제
        localStorage.removeItem("surveyResultData");

        // 설문 시작 페이지(혹은 안내 페이지)로 이동
        router.push("/survey");
      } catch (error) {
        console.error("초기화 실패:", error);
        alert("처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    }
  };

  const handleLogout = () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      localStorage.removeItem("userId");
      localStorage.removeItem("accessToken");
      router.push("/login");
    }
  };

  if (isLoading || !user) {
    return (
      <main className="flex flex-col w-full bg-white items-center justify-center min-h-[100dvh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#FFCC00] rounded-full animate-spin"></div>
      </main>
    );
  }

  return (
    <main className="flex flex-col w-full bg-white text-[#1A1A1A] font-sans min-h-[100dvh] pb-[80px]">

      <header className="flex items-center justify-between px-5 py-4 sticky top-0 bg-white z-20">
        <h1 className="text-[22px] font-bold tracking-tight">마이페이지</h1>
        <button className="p-1 hover:bg-gray-100 rounded-full transition-colors">
          <Settings className="w-6 h-6" strokeWidth={2} />
        </button>
      </header>

      {/* 멘티 프로필 영역 */}
      <div className="flex flex-col px-5 py-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-[72px] h-[72px] bg-[#111116] rounded-2xl flex flex-col items-center justify-center text-white shrink-0 shadow-sm">
            <span className="text-[15px] font-extrabold mb-1">멘티</span>
            <span className="text-[10px] font-bold tracking-widest">—O—O—</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[20px] font-semibold tracking-tight">{user.nickname}</h2>
              {user.surveyType !== "유형 없음" && (
                <span className="inline-block bg-[#FFCC00] text-black text-[12px] font-semibold px-2.5 py-1 rounded-md">
                  {user.surveyType}
                </span>
              )}
            </div>

            {/* 💡 3. 다시하기 버튼 추가 (프로필 옆/아래 배치) */}
            <button
              onClick={handleRetakeSurvey}
              className="flex items-center gap-1.5 text-gray-500 hover:text-[#1A1A1A] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="text-[13px] font-medium border-b border-gray-300">멘토링 타입 테스트 다시하기</span>
            </button>
          </div>
        </div>
      </div>

      {/* 사전 질문권 개수 영역 */}
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

      {/* 메인 메뉴 리스트 */}
      <div className="flex flex-col px-5 mb-6">
        <Link href="#" className="flex items-center justify-between py-4 group">
          <div className="flex items-center gap-3">
            <UserPen className="w-[22px] h-[22px] text-gray-500" strokeWidth={2} />
            <span className="text-[16px] font-medium">멘티프로필 수정</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </Link>

        {/* ... (기타 메뉴 생략) ... */}

        <Link href="/mypage/scripts" className="flex items-center justify-between py-4 group">
          <div className="flex items-center gap-3">
            <ScrollText className="w-[22px] h-[22px] text-gray-500" strokeWidth={2} />
            <span className="text-[16px] font-medium">스크립트 목록</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </Link>
      </div>

      <div className="w-full h-[8px] bg-[#F8F9FA]" />

      {/* 서브 메뉴 및 로그아웃 */}
      <div className="flex flex-col px-5 mt-4">
        <Link href="#" className="flex items-center justify-between py-4 group">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-[22px] h-[22px] text-gray-500" strokeWidth={2} />
            <span className="text-[16px] font-medium">서비스 이용 안내</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </Link>

        <button
          onClick={handleLogout} 
          className="flex items-center justify-between py-4 group w-full text-left"
        >
          <div className="flex items-center gap-3">
            <LogOut className="w-[22px] h-[22px] text-red-500" strokeWidth={2} />
            <span className="text-[16px] font-medium text-red-500">로그아웃</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </button>
      </div>

    </main>
  );
}