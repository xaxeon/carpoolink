"use client";

// 1. Suspense를 추가로 import 합니다.
import { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, FileText, Calendar, User, Users, ChevronRight, Edit3, CheckCircle2, Search } from "lucide-react";
import apiClient from "@/lib/apiClient";

type ScriptItem = {
  id: number;
  mentorName: string;
  topic: string;
  date: string;
  isPublished: boolean;
  isGroup: boolean;
  profileColor: string;
};

const COLORS = ["bg-blue-500", "bg-emerald-500", "bg-purple-900", "bg-orange-900", "bg-pink-600"];

// 2. 기존의 ScriptListPage를 ScriptListContent로 이름을 바꾸고 export default를 제거합니다.
function ScriptListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 쿼리 파라미터(?type=group)를 읽어 초기 탭 상태 결정
  const currentTabParam = searchParams.get("type") === "group" ? "1:N" : "1:1";
  const [activeTab, setActiveTab] = useState<"1:1" | "1:N">(currentTabParam);

  // 상태 관리
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 현재 접속 유저 권한 상태
  const [isUserMentor, setIsUserMentor] = useState(false);

  // 탭 클릭 시 URL 쿼리 파라터를 업데이트하는 함수
  const handleTabChange = (tab: "1:1" | "1:N") => {
    setActiveTab(tab);
    const type = tab === "1:1" ? "one-on-one" : "group";
    router.replace(`/mypage/scripts?type=${type}`, { scroll: false });
  };

  // 초기 로딩 시 유저 정보 및 스크립트 목록 가져오기
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);

      // [1] 유저 권한 확인 (스크립트 로딩과 분리하여 안전하게 실행)
      let isMentor = false;
      try {
        const userRes = await apiClient.get("/api/users/me");
        isMentor = userRes.data?.role === "MENTOR";
        setIsUserMentor(isMentor);
      } catch (userError) {
        console.error("유저 정보 로딩 실패:", userError);
      }

      // [2] 스크립트 목록 조회
      try {
        const typeParam = activeTab === "1:1" ? "one-on-one" : "group";
        const scriptRes = await apiClient.get(`/api/scripts?type=${typeParam}`);

        const mappedScripts: ScriptItem[] = scriptRes.data.mentorings.map((m: any) => {
          const d = m.startedAt ? new Date(m.startedAt) : null;
          const dateStr = d
            ? `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`
            : "날짜 미상";

          return {
            id: Number(m.mentoringId),
            mentorName: m.host?.nickname || "알 수 없음",
            topic: m.title,
            date: dateStr,
            isGroup: m.isGroup,
            profileColor: COLORS[Number(m.mentoringId) % COLORS.length],
            isPublished: Boolean(m.isScriptPublished),
          };
        });

        setScripts(mappedScripts);
      } catch (error) {
        console.error("스크립트 데이터 로딩 실패:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [activeTab]);

  const processedScripts = useMemo(() => {
    let list = [...scripts];

    if (searchQuery.trim() !== "") {
      list = list.filter(script =>
        script.topic.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    list.sort((a, b) => {
      const dateA = new Date(a.date.split(". ").join("-")).getTime();
      const dateB = new Date(b.date.split(". ").join("-")).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return list;
  }, [scripts, searchQuery, sortOrder]);

  // 라우팅 로직: 멘토의 발행 전은 편집 뷰, 발행 완료는 열람 뷰
  const handleScriptClick = (scriptId: number, isPublished: boolean) => {
    if (!isPublished) {
      if (isUserMentor) {
        router.push(`/script/${scriptId}`);
      }
    } else {
      router.push(`/mypage/scripts/${scriptId}`);
    }
  };

  return (
    <main className="flex flex-col w-full bg-white text-[#1A1A1A] font-sans min-h-[100dvh] pb-[80px]">

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

      <div className="flex w-full border-b border-gray-100">
        <button
          onClick={() => handleTabChange("1:1")}
          className={`flex-1 py-4 text-[15px] font-bold transition-all relative ${activeTab === "1:1" ? "text-[#1A1A1A]" : "text-gray-400"}`}
        >
          1:1 멘토링
          {activeTab === "1:1" && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#1A1A1A]" />}
        </button>
        <button
          onClick={() => handleTabChange("1:N")}
          className={`flex-1 py-4 text-[15px] font-bold transition-all relative ${activeTab === "1:N" ? "text-[#1A1A1A]" : "text-gray-400"}`}
        >
          1:N 멘토링
          {activeTab === "1:N" && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#1A1A1A]" />}
        </button>
      </div>

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

      <div className="flex flex-col px-5 pb-5 gap-4">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-[#FFCC00] rounded-full animate-spin"></div>
          </div>
        ) : processedScripts.length > 0 ? (
          processedScripts.map((script) => {
            const isMenteeWaiting = !isUserMentor && !script.isPublished;

            return (
              <div
                key={script.id}
                onClick={() => !isMenteeWaiting && handleScriptClick(script.id, script.isPublished)}
                className={`flex flex-col bg-white border border-gray-100 rounded-2xl p-5 shadow-sm transition-all
                  ${isMenteeWaiting ? 'opacity-60 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:shadow-md active:scale-[0.98]'}
                `}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {script.isGroup ? (
                      <div className={`w-10 h-10 rounded-lg ${script.profileColor} flex items-center justify-center text-white shrink-0`}>
                        <Users className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className={`w-10 h-10 rounded-full ${script.profileColor} flex items-center justify-center text-white shrink-0`}>
                        <User className="w-5 h-5" />
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
                        {isUserMentor ? "편집 필요" : "발행 대기중"}
                      </div>
                    )}
                  </div>
                  <ChevronRight className={`w-4 h-4 ${isMenteeWaiting ? 'text-gray-200' : 'text-gray-300'}`} />
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

// 3. 페이지 자체는 이제 Suspense로 내부 콘텐츠를 감싸주는 역할만 합니다.
export default function ScriptListPage() {
  return (
    // 클라이언트에서 쿼리 파라미터를 읽어올 때 깜빡임을 방지하기 위해 fallback UI를 제공합니다.
    <Suspense fallback={
      <div className="flex w-full min-h-[100dvh] items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#FFCC00] rounded-full animate-spin"></div>
      </div>
    }>
      <ScriptListContent />
    </Suspense>
  );
}