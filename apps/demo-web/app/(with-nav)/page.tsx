"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronDown, AlertCircle } from "lucide-react";

import apiClient from "@/lib/apiClient";

const CATEGORIES = ["전체", "업무", "일상", "보상", "성장", "커리어", "업계", "멘탈", "실전", "기타"];

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

interface Mentor {
  mentorId: string | number;
  userId: string | number;
  nickname: string;
  price: number;
  fields: string[];
  updatedAt: string;
}

export default function HomePage() {
  const [activeCategory, setActiveCategory] = useState("전체");
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchMentors = async () => {
      try {
        const res = await apiClient.get("/mentors");
        setMentors(res.data.mentors || []);
      } catch (error) {
        console.error("멘토 목록 로딩 실패:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMentors();
  }, []);

  // 카테고리 필터 + 검색어 필터 동시 적용
  const filteredMentors = useMemo(() => {
    let list = mentors;

    // 1. 카테고리 필터링
    if (activeCategory !== "전체") {
      list = list.filter((mentor) => {
        const koreanFields = mentor.fields.map(f => FIELD_MAP[f] || "기타");
        return koreanFields.includes(activeCategory);
      });
    }

    // 2. 검색어 필터링 (닉네임 기준)
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      list = list.filter((mentor) => 
        mentor.nickname.toLowerCase().includes(q)
      );
    }

    return list;
  }, [mentors, activeCategory, searchQuery]);

  return (
    <main className="flex flex-col w-full bg-white text-[#1A1A1A] font-sans min-h-[100dvh]">
      
      {/* 💡 검색 상태에 따라 동적으로 변하는 헤더 */}
      <header className={`flex items-center justify-between px-5 py-4 sticky top-0 bg-white z-20 transition-all duration-300 ${isSearchOpen ? 'pb-2' : ''}`}>
        {!isSearchOpen ? (
          <>
            <button className="flex items-center gap-1 text-[20px] font-extrabold tracking-tight">
              전체 지역 <ChevronDown className="w-5 h-5 mt-0.5" strokeWidth={2.5} />
            </button>
            <button 
              type="button" 
              onClick={() => setIsSearchOpen(true)} 
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Search className="w-6 h-6" strokeWidth={2.5} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 w-full animate-in slide-in-from-right-4 duration-300">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={2.5} />
              <input 
                autoFocus 
                type="text" 
                placeholder="멘토 닉네임 검색" 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="w-full bg-gray-100 py-2.5 pl-10 pr-4 rounded-xl text-[14px] font-medium focus:outline-none" 
              />
            </div>
            <button 
              type="button" 
              onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }} 
              className="text-[14px] font-bold text-gray-500 px-1"
            >
              취소
            </button>
          </div>
        )}
      </header>

      <div className="flex gap-2 overflow-x-auto px-5 py-2 scrollbar-hide">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`shrink-0 px-4 py-2 rounded-full text-[14px] font-bold border transition-colors
              ${activeCategory === category 
                ? 'bg-[#2B2F3A] text-white border-[#2B2F3A]' 
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }
            `}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="flex flex-col pb-20">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-[#FFCC00] rounded-full animate-spin"></div>
          </div>
        ) : filteredMentors.length > 0 ? (
          filteredMentors.map((mentor) => {
            const displayTags = mentor.fields.length > 0 
              ? mentor.fields.map(f => FIELD_MAP[f] || "기타").join(" / ") 
              : "분야 미정";

            return (
              <Link 
                key={mentor.mentorId} 
                href={`/mentor/${mentor.mentorId}`}
                className="flex gap-4 px-5 py-6 border-b border-gray-100/60 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
              >
                <div className="relative shrink-0">
                  <img 
                    src="/images/mentor_profile.jpg" 
                    alt={`${mentor.nickname} 프로필`}
                    className="w-[92px] h-[92px] rounded-2xl object-cover bg-gray-100 border border-gray-100"
                  />
                </div>

                <div className="flex flex-col flex-1 min-w-0 pt-0.5">
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className="bg-[#F2F4F6] text-gray-600 text-[11px] font-bold px-2 py-1 rounded-[4px]">
                      {displayTags}
                    </span>
                  </div>

                  <h3 className="text-[16px] font-bold text-[#1A1A1A] leading-snug mb-1 truncate">
                    {mentor.nickname} 멘토와 함께하는 카풀링
                  </h3>
                  <p className="text-[15px] font-extrabold text-[#1A1A1A] mb-2.5">
                    {mentor.price.toLocaleString()}원 <span className="text-sm font-medium text-gray-500">/ 60분</span>
                  </p>

                </div>
              </Link>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <AlertCircle className="w-10 h-10 mb-4 text-gray-300" />
            <p className="font-medium text-[15px]">조건에 맞는 멘토가 없습니다.</p>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </main>
  );
}