"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, ArrowRight } from "lucide-react";
// 💡 실제 통신을 위해 apiClient를 불러옵니다.
import apiClient from "@/lib/apiClient";

export default function LoginPage() {
  const [userId, setUserId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  // 💡 async 함수로 변경하여 API 통신을 기다릴 수 있게 합니다.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!userId.trim()) {
      setErrorMsg("아이디를 입력해주세요.");
      return;
    }

    setIsLoading(true);

    try {
      // 💡 1. [임시 우회 적용] POST /login 대신 GET /users/exists 엔드포인트를 찌릅니다.
      const response = await apiClient.get("/api/users/exists", {
        headers: {
          "x-user-id": userId,
        },
      });

      // DB에 해당 유저가 존재하는 경우 (exists === true)
      if (response.data.exists) {
        // 로컬 스토리지에 백엔드에서 확인된 실제 userId를 저장
        localStorage.setItem("userId", response.data.user.userId.toString());

        // 💡 2. 설문조사 여부 확인 로직 추가
        try {
          // 방금 로컬 스토리지에 저장한 userId를 기반으로 내 상세 정보(/api/users/me)를 불러옵니다.
          const meResponse = await apiClient.get("/api/users/me");
          const userData = meResponse.data;

          localStorage.setItem("userRole", userData.role);

          // 유저가 멘티(MENTEE)이면서, 설문결과(surveyResult)가 없는 경우 /survey로 튕겨냅니다.
          if (userData.role === "MENTEE" && !userData.menteeProfile?.surveyResult) {
            router.push("/survey");
          } else {
            // 멘토이거나 이미 설문을 완료한 멘티인 경우 홈으로 이동
            router.push("/");
          }
        } catch (meError) {
          console.error("유저 상세 정보 호출 실패:", meError);
          // 만약 상세 정보 호출에 실패하더라도 일단 로그인은 된 상태이므로 홈으로 보냅니다.
          router.push("/");
        }

      } else {
        // DB에 유저가 없는 경우 (exists === false)
        setErrorMsg("존재하지 않는 아이디입니다.");
      }

    } catch (error: any) {
      console.error("로그인 실패:", error);
      setErrorMsg("서버 통신 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center w-full h-[100dvh] bg-[#F8F9FA] px-6 font-sans">

      {/* 💡 화면 중앙 로그인 컨테이너 */}
      <div className="w-full max-w-[340px] bg-white p-8 rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.05)] flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* 서비스 로고/브랜딩 영역 */}
        <div className="w-16 h-16 bg-[#FFCC00] rounded-2xl flex items-center justify-center mb-6 shadow-inner">
          <img src="/icons/User.svg" alt="사용자 아이콘" className="w-9 h-9 text-[#1A1A1A]" />
        </div>

        <h1 className="text-[27px] font-extrabold text-[#1A1A1A] tracking-tight text-center mb-2">
          카풀링 방문을 환영합니다
        </h1>
        <p className="text-[13px] text-gray-500 font-medium mb-8 text-center break-keep">
          로그인 후 멘토링 서비스를 시작해 보세요.
        </p>

        {/* 로그인 폼 */}
        <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
          <div className="relative w-full">
            <input
              type="text"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setErrorMsg("");
              }}
              placeholder="아이디를 입력하세요"
              disabled={isLoading}
              className={`w-full bg-[#F2F4F6] text-[#1A1A1A] font-medium text-[15px] py-4 px-5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#FFCC00]/50 transition-all placeholder:text-gray-400
                ${errorMsg ? 'ring-2 ring-red-400/50 bg-red-50' : ''}
              `}
            />
          </div>

          {/* 에러 메시지 출력 영역 */}
          {errorMsg && (
            <p className="text-red-500 text-[12px] font-bold px-1 animate-in fade-in">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#1A1A1A] text-[#FFCC00] font-extrabold text-[16px] py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-black transition-colors active:scale-[0.98] mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-[#FFCC00] rounded-full animate-spin" />
            ) : (
              <>로그인 <ArrowRight className="w-5 h-5" /></>
            )}
          </button>
        </form>

      </div>

    </main>
  );
}