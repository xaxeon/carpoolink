"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronDown, Star, AlertCircle } from "lucide-react";

// 💡 apiClient 임포트 (경로는 프로젝트에 맞게 수정해주세요)
import apiClient from "@/lib/apiClient";

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

// 💡 백엔드 응답에 맞춘 멘토 타입 정의
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

  // 💡 API를 통해 멘토 목록 불러오기
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

  // 💡 선택된 카테고리에 맞게 멘토 리스트 필터링
  const filteredMentors = useMemo(() => {
    if (activeCategory === "전체") return mentors;

    return mentors.filter((mentor) => {
      // 멘토가 가진 영문 필드들을 한글로 변환한 배열 생성
      const koreanFields = mentor.fields.map(f => FIELD_MAP[f] || "기타");
      // 선택된 카테고리가 변환된 배열에 포함되어 있는지 확인
      return koreanFields.includes(activeCategory);
    });
  }, [mentors, activeCategory]);

  return (
    <main className="flex flex-col w-full bg-white text-[#1A1A1A] font-sans min-h-[100dvh]">
      
      <header className="flex items-center justify-between px-5 py-4 sticky top-0 bg-white z-20">
        <button className="flex items-center gap-1 text-[20px] font-extrabold tracking-tight">
          전체 지역 <ChevronDown className="w-5 h-5 mt-0.5" strokeWidth={2.5} />
        </button>
        <button className="p-1">
          <Search className="w-6 h-6" strokeWidth={2.5} />
        </button>
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

      <div className="px-5 py-4 flex">
        <button className="flex items-center gap-1 text-[13px] font-medium text-gray-500">
          최신순 <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* 💡 멘토 리스트 렌더링 영역 */}
      <div className="flex flex-col pb-20">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-[#FFCC00] rounded-full animate-spin"></div>
          </div>
        ) : filteredMentors.length > 0 ? (
          filteredMentors.map((mentor, index) => {
            // UI용 가짜 데이터 (백엔드에서 제공하지 않는 데이터들)
            const colors = ["bg-blue-100", "bg-emerald-100", "bg-orange-100", "bg-pink-100"];
            const profileColor = colors[index % colors.length];
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
                  <div className={`w-[92px] h-[92px] rounded-2xl ${profileColor} flex items-center justify-center overflow-hidden`}>
                    <span className="text-3xl font-bold text-black/20">
                      {mentor.nickname.charAt(0)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col flex-1 min-w-0 pt-0.5">
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className="bg-[#F2F4F6] text-gray-600 text-[11px] font-bold px-2 py-1 rounded-[4px]">
                      {displayTags}
                    </span>
                  </div>

                  <h3 className="text-[16px] font-bold text-[#1A1A1A] leading-snug mb-1 truncate">
                    {mentor.nickname} 멘토와 함께하는 커피챗
                  </h3>
                  <p className="text-[15px] font-extrabold text-[#1A1A1A] mb-2.5">
                    {mentor.price.toLocaleString()}원 <span className="text-sm font-medium text-gray-500">/ 60분</span>
                  </p>

                  <div className="flex flex-col gap-0.5 text-[12.5px]">
                    <div className="flex gap-2">
                      <span className="font-bold text-gray-500">닉네임</span>
                      <span className="text-gray-400">{mentor.nickname}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <AlertCircle className="w-10 h-10 mb-4 text-gray-300" />
            <p className="font-medium text-[15px]">해당 분야의 멘토가 없습니다.</p>
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