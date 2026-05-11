"use client"; // 💡 usePathname을 사용하기 위해 최상단에 추가합니다.

import Link from "next/link";
import { usePathname } from "next/navigation"; // 💡 현재 경로를 가져오는 훅
import { Home, Users, UserCircle, User } from "lucide-react";

export default function WithNavLayout({ children }: { children: React.ReactNode }) {
  // 현재 접속 중인 URL 주소를 가져옵니다. (예: "/mentoring_list/1on1_list")
  const pathname = usePathname();

  // 💡 특정 경로가 현재 URL에 포함되어 있는지 확인하는 도우미 함수
  // 홈("/")은 정확히 일치할 때만 활성화하고, 나머지는 하위 페이지에 들어가도 활성화되도록 startsWith를 사용합니다.
  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname?.startsWith(path);
  };

  return (
    <div className="flex flex-col w-full h-[100dvh] bg-white overflow-hidden relative font-sans">
      
      {/* 본문 영역 */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      {/* 하단 네비게이션 바 */}
      {/* 💡 nav 태그 자체의 텍스트 색상을 지우고, 각 버튼에서 개별적으로 제어하도록 변경했습니다. */}
      <nav className="w-full shrink-0 bg-white border-t border-gray-100 flex justify-between px-2 pt-2 pb-safe z-50">
        
        {/* 홈 */}
        <Link 
          href="/" 
          className={`flex flex-col items-center justify-center p-2 flex-1 transition-colors 
            ${isActive("/") ? "text-[#1A1A1A]" : "text-gray-400 hover:text-gray-900"}
          `}
        >
          {/* 활성화되면 선 굵기(strokeWidth)도 2에서 2.5로 진하게 만듭니다. */}
          <Home className="w-6 h-6 mb-1" strokeWidth={isActive("/") ? 2.5 : 2} />
          <span className="text-[11px] font-bold tracking-tight">홈</span>
        </Link>

        {/* 1:N 멘토링 */}
        <Link 
          href="/mentoring_list/live_list" 
          className={`flex flex-col items-center justify-center p-2 flex-1 transition-colors 
            ${isActive("/mentoring_list/live_list") ? "text-[#1A1A1A]" : "text-gray-400 hover:text-gray-900"}
          `}
        >
          <Users className="w-6 h-6 mb-1" strokeWidth={isActive("/mentoring_list/live_list") ? 2.5 : 2} />
          <span className="text-[11px] font-bold tracking-tight whitespace-nowrap">1:N 멘토링</span>
        </Link>

        {/* 1:1 멘토링 */}
        <Link 
          href="/mentoring_list/1on1_list" 
          className={`flex flex-col items-center justify-center p-2 flex-1 transition-colors 
            ${isActive("/mentoring_list/1on1_list") ? "text-[#1A1A1A]" : "text-gray-400 hover:text-gray-900"}
          `}
        >
          <UserCircle className="w-6 h-6 mb-1" strokeWidth={isActive("/mentoring_list/1on1_list") ? 2.5 : 2} />
          <span className="text-[11px] font-bold tracking-tight whitespace-nowrap">1:1 멘토링</span>
        </Link>

        {/* 마이페이지 */}
        <Link 
          href="/mypage" 
          className={`flex flex-col items-center justify-center p-2 flex-1 transition-colors 
            ${isActive("/mypage") ? "text-[#1A1A1A]" : "text-gray-400 hover:text-gray-900"}
          `}
        >
          <User className="w-6 h-6 mb-1" strokeWidth={isActive("/mypage") ? 2.5 : 2} />
          <span className="text-[11px] font-bold tracking-tight">마이페이지</span>
        </Link>

      </nav>
      
    </div>
  );
}