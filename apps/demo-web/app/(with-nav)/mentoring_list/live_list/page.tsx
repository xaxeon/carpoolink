"use client";

import { useState, useMemo, Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, ChevronDown, Users, Radio, Check, AlertCircle } from "lucide-react";

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

  const activeCategory = searchParams.get("category") || "전체";
  const sortBy = searchParams.get("sort") || "viewers";

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);

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
    <div className="flex flex-col w-full bg-white text-[#1A1A1A] font-sans min-h-[100dvh] relative">
      <header className={`sticky top-0 bg-white z-20 transition-all duration-300 ${isSearchOpen ? 'pb-2' : ''}`}>
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

      <div className="flex gap-2 overflow-x-auto px-5 py-2 scrollbar-hide">
        {CATEGORIES.map((category) => (
          <button key={category} type="button" onClick={() => handleCategoryClick(category)} className={`shrink-0 px-4 py-2 rounded-full text-[14px] font-bold border transition-all ${activeCategory === category ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-500 border-gray-200'}`}>
            {category}
          </button>
        ))}
      </div>

      <div className="px-5 py-4 flex items-center justify-between relative">
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

      <div className="flex flex-col px-5 gap-6 pb-10 flex-1">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-[#FFCC00] rounded-full animate-spin"></div>
          </div>
        ) : filteredAndSortedStreams.length > 0 ? (
          filteredAndSortedStreams.map((stream) => (
            <Link key={stream.mentoringId} href={`/mentoring_list/live_list/${stream.mentoringId}`} className="group flex flex-col gap-3">
              
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

      {isSortMenuOpen && <div className="fixed inset-0 z-20" onClick={() => setIsSortMenuOpen(false)} />}
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