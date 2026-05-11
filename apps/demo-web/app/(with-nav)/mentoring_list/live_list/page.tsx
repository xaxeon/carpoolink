"use client";

import { useState, useMemo, Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, ChevronDown, Users, Check, AlertCircle, Plus, ChevronLeft } from "lucide-react"; // ChevronLeft 추가 (다만, 이전 요청에 따라 사용은 안 함)

import apiClient from "@/lib/apiClient";

// 💡 상단 카테고리 정의
const CATEGORIES = ["전체", "업무", "일상", "보상", "성장", "커리어", "업계", "멘탈", "실전", "기타"];

// 💡 DB 필드와 UI 카테고리 매핑 테이블
const FIELD_MAP: Record<string, string> = {
  WORK: "업무",
  LIFE: "일상",
  REWARD: "보상",
  GROWTH: "성장",
  CAREER: "커리어",
  INDUSTRY: "업계",
  MENTAL: "멘탈",
  ACTUAL: "실전",
  ETC: "기타",
};

const SORT_OPTIONS = [
  { id: "viewers", label: "시청자 많은순" },
  { id: "newest", label: "최신순" },
  { id: "oldest", label: "오래된 순" },
];

interface MentoringStream {
  mentoringId: number;
  title: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  host: {
    userId: number;
    nickname: string;
    fields: string[];
  };
  participantCount: number;
  // 단일 string이 아닌 string 배열로 관리합니다.
  categories: string[];
}

function LiveListContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isMounted, setIsMounted] = useState(false);
  const [streams, setStreams] = useState<MentoringStream[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeCategory = searchParams.get("category") || "전체";
  const sortBy = searchParams.get("sort") || "viewers";

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    const storedRole = localStorage.getItem("userRole");
    if (storedRole) setUserRole(storedRole);

    const fetchLiveStreams = async () => {
      try {
        const res = await apiClient.get("/api/mentorings/group", {
          params: { status: "ON_AIR" }
        });

        const fetchedData = res.data.mentorings.map((m: any) => {
          // 호스트가 가진 "모든" 영문 필드를 한글 카테고리 배열로 변환
          const rawFields = m.host?.fields && m.host.fields.length > 0 ? m.host.fields : ["ETC"];
          const mappedCategories = rawFields.map((field: string) => FIELD_MAP[field] || "기타");

          return {
            ...m,
            categories: mappedCategories, // 변환된 배열을 그대로 저장
          };
        });

        setStreams(fetchedData);
      } catch (error) {
        console.error("라이브 멘토링 목록 로딩 실패:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLiveStreams();
  }, []);

  const handleCategoryClick = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category === "전체") params.delete("category");
    else params.set("category", category);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleSortClick = (sortId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortId === "viewers") params.delete("sort");
    else params.set("sort", sortId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setIsSortMenuOpen(false);
  };

  const isValidTitle = titleInput.trim().length >= 1 && titleInput.length <= 200;

  const handleStartMentoring = async () => {
    if (!isValidTitle || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await apiClient.post("/media/mentorings/start", {
        title: titleInput.trim(),
        isGroup: true,
        hasCamera: true,
        hasMicrophone: true,
      });
      const createdMentoringId = res.data?.mentoring?.mentoringId;
      setIsDrawerOpen(false);
      setTitleInput("");
      router.push(createdMentoringId ? `/mentoring/live/mentor/${createdMentoringId}` : "/mentoring/live/mentor");
    } catch (error) {
      alert("멘토링 시작에 실패했습니다.");
    } finally { setIsSubmitting(false); }
  };

  const filteredAndSortedStreams = useMemo(() => {
    let list = [...streams];

    // categories 배열 안에 선택된 탭(activeCategory)이 포함되어 있는지 검사
    if (activeCategory !== "전체") {
      list = list.filter(s => s.categories.includes(activeCategory));
    }

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.host.nickname.toLowerCase().includes(q)
      );
    }

    if (sortBy === "viewers") {
      list.sort((a, b) => b.participantCount - a.participantCount);
    } else if (sortBy === "newest") {
      list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    } else if (sortBy === "oldest") {
      list.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    }

    return list;
  }, [streams, activeCategory, searchQuery, sortBy]);

  if (!isMounted) return <div className="w-full h-screen bg-white" />;

  return (
    <div className="flex flex-col w-full bg-white text-[#1A1A1A] font-sans h-[100dvh] relative overflow-hidden pb-[64px]">

      {/* 헤더 및 리스트 영역 (기존 디자인 유지) */}
      <header className={`sticky top-0 bg-white z-20 transition-all duration-300 shrink-0 ${isSearchOpen ? 'pb-2' : ''}`}>
        <div className="flex items-center justify-between px-5 py-4">
          {!isSearchOpen ? (
            <>
              <h1 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2">
                1:N 라이브 멘토링
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              </h1>
              <button type="button" onClick={() => setIsSearchOpen(true)} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                <Search className="w-6 h-6" strokeWidth={2.5} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 w-full animate-in slide-in-from-right-4 duration-300">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={2.5} />
                <input autoFocus type="text" placeholder="검색어 입력" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-gray-100 py-2.5 pl-10 pr-4 rounded-xl text-[14px] font-medium focus:outline-none" />
              </div>
              <button type="button" onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }} className="text-[14px] font-bold text-gray-500 px-1">취소</button>
            </div>
          )}
        </div>
      </header>

      {/* 카테고리 (기존 디자인 유지) */}
      <div className="flex gap-2 overflow-x-auto px-5 py-2 shrink-0 scrollbar-hide">
        {CATEGORIES.map((category) => (
          <button key={category} type="button" onClick={() => handleCategoryClick(category)} className={`shrink-0 px-4 py-2 rounded-full text-[14px] font-bold border transition-all ${activeCategory === category ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-500 border-gray-200'}`}>
            {category}
          </button>
        ))}
      </div>

      {/* 정렬 및 결과 수 (기존 디자인 유지) */}
      <div className="px-5 py-4 flex items-center justify-between shrink-0 relative">
        <button type="button" onClick={() => setIsSortMenuOpen(!isSortMenuOpen)} className="flex items-center gap-1 text-[13px] font-bold text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg">
          {SORT_OPTIONS.find(opt => opt.id === sortBy)?.label}
          <ChevronDown className={`w-4 h-4 transition-transform ${isSortMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {isSortMenuOpen && (
          <div className="absolute top-14 left-5 w-[160px] bg-white border border-gray-100 rounded-2xl shadow-xl z-30 p-2">
            {SORT_OPTIONS.map((option) => (
              <button key={option.id} type="button" onClick={() => handleSortClick(option.id)} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-bold ${sortBy === option.id ? 'bg-[#FFCC00]/10 text-[#1A1A1A]' : 'text-gray-500 hover:bg-gray-50'}`}>
                {option.label}
                {sortBy === option.id && <Check className="w-4 h-4 text-[#FFCC00]" />}
              </button>
            ))}
          </div>
        )}
        <span className="text-[12px] font-bold text-gray-400">결과 {filteredAndSortedStreams.length}개</span>
      </div>

      {/* 스트리밍 목록 (기존 스크롤 및 레이아웃 유지) */}
      <div className="flex flex-col px-5 gap-6 pb-10 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-[#FFCC00] rounded-full animate-spin"></div>
          </div>
        ) : filteredAndSortedStreams.length > 0 ? (
          filteredAndSortedStreams.map((stream) => (
            <Link
              key={stream.mentoringId}
              href={userRole === "MENTOR" ? `/mentoring/live/mentor/${stream.mentoringId}` : `/mentoring/live/mentee/${stream.mentoringId}`}
              className="group flex flex-col gap-3"
            >

              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-gray-100 border border-gray-100">
                <img
                  src="/images/thumbnail.jpg"
                  alt="멘토링 썸네일"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 left-3 bg-red-600 text-white text-[11px] font-extrabold px-2 py-1 rounded-[6px] flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
                </div>
                <div className="absolute bottom-3 right-3 bg-black/70 text-white text-[12px] font-bold px-2.5 py-1 rounded-[8px] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {stream.participantCount}명 시청 중
                </div>
              </div>

              <div className="flex gap-3 px-1">
                <img
                  src="/images/mentor_profile.jpg"
                  alt="멘토 프로필"
                  className="w-10 h-10 rounded-full shrink-0 object-cover bg-black"
                />
                <div className="flex flex-col flex-1 min-w-0 pt-0.5">
                  <h3 className="text-[16px] font-bold text-[#1A1A1A] truncate">{stream.title}</h3>
                  {/* 배열 요소들을 슬래시(/) 기호로 이어 붙여 화면에 표시합니다. */}
                  <p className="text-[13px] font-medium text-gray-500">{stream.host.nickname} · {stream.categories.join(" / ")}</p>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <AlertCircle className="w-10 h-10 text-gray-300 mb-4" />
            <p className="text-gray-400 font-bold text-[15px]">해당하는 라이브가 없습니다.</p>
          </div>
        )}
      </div>

      {/* 💡 MENTOR 전용 플로팅 버튼: 마우스 포인터 스타일(`cursor-pointer`)을 추가하고 바텀 시트 아래에 위치(`z-10`) */}
      {userRole === "MENTOR" && (
        <button
          onClick={() => setIsDrawerOpen(true)}
          className="absolute bottom-[84px] right-5 flex items-center justify-center w-14 h-14 bg-[#1A1A1A] text-white rounded-full shadow-2xl transition-transform active:scale-95 z-10 cursor-pointer"
          aria-label="멘토링 생성"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* 💡 바텀 시트 오버레이: 하단 패딩(pb-[64px])을 제거하여 시트를 바닥에 붙임 */}
      <div
        className={`absolute inset-0 z-20 flex flex-col justify-end bg-black/50 transition-opacity duration-500 ease-in-out ${isDrawerOpen ? "opacity-100 visible pointer-events-auto" : "opacity-0 invisible pointer-events-none"
          }`}
        onClick={() => setIsDrawerOpen(false)}
      >
        <div
          className={`w-full bg-white rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.06)] flex flex-col transition-all duration-500 ease-in-out transform ${isDrawerOpen ? "translate-y-0" : "translate-y-full"
            }`}
          style={{ minHeight: "45vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 (중앙 정렬) */}
          <div className="w-full px-5 py-5 flex items-center justify-center shrink-0">
            <h2 className="text-[17px] font-extrabold text-[#1A1A1A]">라이브 멘토링 시작</h2>
          </div>

          {/* 💡 입력 폼 영역: 하단 패딩(pb-[84px])을 여기에 추가하여 버튼을 내비바 위로 올리고 배경은 바닥까지 채움 */}
          <div className="flex-1 px-5 pt-2 pb-[84px] flex flex-col">
            <div className="flex flex-col gap-2 mb-6">
              <input
                type="text"
                placeholder="멘토링 제목을 입력해주세요"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className={`w-full py-3.5 px-4 rounded-xl text-[15px] font-medium focus:outline-none focus:ring-2 transition-all ${!isValidTitle && titleInput.length > 0
                  ? "bg-red-50 border border-red-200 focus:ring-red-100"
                  : "bg-gray-100 focus:ring-[#1A1A1A]/20"
                  }`}
              />
              {!isValidTitle && titleInput.length > 0 && (
                <p className="text-red-500 text-[12px] font-bold pl-1 animate-in fade-in">
                  1~200자의 제목을 입력해주세요.
                </p>
              )}
            </div>

            {/* 버튼: mt-auto로 하단에 고정, cursor-pointer 적용 */}
            <button
              onClick={handleStartMentoring}
              disabled={!isValidTitle || isSubmitting}
              className={`w-full py-4 rounded-xl text-[16px] font-bold transition-colors mt-auto cursor-pointer ${isValidTitle && !isSubmitting
                ? "bg-[#1A1A1A] text-white hover:bg-black"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
            >
              {isSubmitting ? "생성 중..." : "멘토링 시작하기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LiveListPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LiveListContent />
    </Suspense>
  );
}