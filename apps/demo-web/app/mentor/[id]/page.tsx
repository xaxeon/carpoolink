"use client";

// 1. React에서 'use'를 추가로 임포트합니다.
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, HelpCircle, AlertCircle } from "lucide-react";
import apiClient from "@/lib/apiClient";

// DB 필드와 UI 카테고리 매핑 테이블
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

interface MentorDetail {
  mentorId: number;
  nickname: string;
  price: number;
  fields: string[];
  bio: string;
  info?: {
    tags?: string[];
    details?: string[];
    locations?: string[];
  };
  count?: number;
}

// 2. params의 타입을 Promise 형태로 감싸줍니다.
export default function MentorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();

  // 3. React.use()를 사용하여 비동기 params를 동기적으로 풀어줍니다!
  const unwrappedParams = use(params);
  const mentorId = unwrappedParams.id;

  const [mentor, setMentor] = useState<MentorDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMentorDetail = async () => {
      try {
        // 4. 풀어낸 mentorId를 사용합니다.
        const res = await apiClient.get(`/api/mentors/${mentorId}`);
        setMentor(res.data.mentor || res.data);
      } catch (err) {
        console.error("멘토 상세 정보 로딩 실패:", err);
        setError("멘토 정보를 불러오지 못했습니다.");
      } finally {
        setIsLoading(false);
      }
    };

    if (mentorId) {
      fetchMentorDetail();
    }
  }, [mentorId]); // 5. 의존성 배열(dependency array)에도 mentorId를 넣어줍니다.

  if (isLoading) {
    return (
      <main className="w-full max-w-md mx-auto h-[100dvh] bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#FFCC00] rounded-full animate-spin"></div>
      </main>
    );
  }

  if (error || !mentor) {
    return (
      <main className="w-full max-w-md mx-auto h-[100dvh] bg-white flex flex-col items-center justify-center text-gray-400">
        <AlertCircle className="w-10 h-10 mb-4 text-gray-300" />
        <p className="font-medium text-[15px]">{error || "멘토를 찾을 수 없습니다."}</p>
        <button onClick={() => router.back()} className="mt-6 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm">
          뒤로 가기
        </button>
      </main>
    );
  }

  const title = `${mentor.nickname} 멘토와 함께하는 커피챗`;
  const countStr = `카풀링 ${mentor.count || 0}회`;
  const fieldTags = mentor.fields && mentor.fields.length > 0
    ? mentor.fields.map(f => FIELD_MAP[f] || "기타")
    : ["분야 미정"];

  // 기본값을 빈 배열([])로 설정합니다.
  const infoTags = mentor.info?.tags || [];
  const detailTags = mentor.info?.details || [];
  const locationTags = mentor.info?.locations || [];
  const priceStr = `${mentor.price?.toLocaleString() || 0}원 / 60분`;

  const handleRegisterMentoring = async () => {
    if (isRegistering) {
      router.push('/mentoring_list/1on1_list');
      return;
    }

    try {
      setIsRegistering(true);

      const res = await apiClient.post(`/api/mentors/${mentorId}/register`);

      if (res.data?.mentoring) {
        router.push('/mentoring_list/1on1_list');
        return;
      }

      throw new Error('사전상담 시작에 실패했습니다.');
    } catch (err) {
      console.error('사전상담 시작 실패:', err);
      alert('사전상담 시작에 실패했습니다.');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <main className="w-full max-w-md mx-auto h-[100dvh] bg-white relative shadow-sm flex flex-col font-sans">

      <header className="flex items-center justify-between px-2 py-3 bg-white sticky top-0 z-20">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
          <img src="/icons/arrow.svg" alt="뒤로가기" className="w-5 h-5 text-[#1A1A1A]" />
        </button>
        <button className="p-2 hover:bg-gray-50 rounded-full transition-colors">
          <MoreVertical className="w-5 h-5 text-[#1A1A1A]" strokeWidth={2.5} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-[100px] custom-scrollbar">

        <h1 className="text-[22px] font-bold text-[#1A1A1A] leading-snug mt-2 mb-8 tracking-tight">
          {title}
        </h1>

        <div className="flex items-center gap-4 mb-10">
          <img
            src="/images/mentor_profile.jpg"
            alt={`${mentor.nickname} 프로필`}
            className="w-[72px] h-[72px] object-cover rounded-[20px] shrink-0 border border-gray-100"
          />
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[18px] font-bold text-[#1A1A1A]">{mentor.nickname}</h2>
            <span className="inline-block bg-[#F2F4F6] text-gray-600 text-[12px] font-medium px-2.5 py-1 rounded-[6px] w-fit">
              {countStr}
            </span>
          </div>
        </div>

        {/* 섹션: 멘토 정보 (데이터 없으면 "정보가 없습니다" 표시) */}
        <section className="mb-10">
          <h3 className="text-[15px] font-bold text-[#1A1A1A] mb-4">멘토 정보</h3>
          <div className="flex flex-wrap gap-2">
            {infoTags.length > 0 ? (
              infoTags.map((tag, idx) => (
                <span key={idx} className="bg-[#F8F9FA] text-[#333333] text-[14px] px-3.5 py-1.5 rounded-full border border-gray-100">
                  {tag}
                </span>
              ))
            ) : (
              <p className="text-gray-400 text-[14px] ml-1">정보가 없습니다</p>
            )}
          </div>
        </section>

        {/* 섹션: 멘토링 분야 */}
        <section className="mb-10">
          <div className="flex items-center gap-1 mb-4">
            <h3 className="text-[15px] font-bold text-[#1A1A1A]">멘토링 분야</h3>
            <HelpCircle className="w-4 h-4 text-gray-400" strokeWidth={2} />
          </div>
          <div className="flex flex-wrap gap-2">
            {fieldTags.length > 0 ? (
              fieldTags.map((tag, idx) => (
                <span key={idx} className="bg-[#F8F9FA] text-[#333333] text-[14px] px-3.5 py-1.5 rounded-full border border-gray-100">
                  {tag}
                </span>
              ))
            ) : (
              <p className="text-gray-400 text-[14px] ml-1">정보가 없습니다</p>
            )}
          </div>
        </section>

        {/* 섹션: 멘토링 세부 분야 (데이터 없으면 "정보가 없습니다" 표시) */}
        <section className="mb-10">
          <h3 className="text-[15px] font-bold text-[#1A1A1A] mb-4">멘토링 세부 분야</h3>
          <div className="flex flex-wrap gap-2">
            {detailTags.length > 0 ? (
              detailTags.map((tag, idx) => (
                <span key={idx} className="bg-[#F8F9FA] text-[#333333] text-[14px] px-3.5 py-1.5 rounded-full border border-gray-100">
                  {tag}
                </span>
              ))
            ) : (
              <p className="text-gray-400 text-[14px] ml-1">정보가 없습니다</p>
            )}
          </div>
        </section>

        {/* 섹션: 멘토링 소개 */}
        <section className="mb-10">
          <h3 className="text-[15px] font-bold text-[#1A1A1A] mb-4">멘토링 소개</h3>
          <p className="text-[15px] text-[#333333] leading-[1.7] whitespace-pre-wrap tracking-tight">
            {mentor.bio || "멘토링 소개가 아직 작성되지 않았습니다."}
          </p>
        </section>

        {/* 섹션: 멘토링 가능 지역 (데이터 없으면 "정보가 없습니다" 표시) */}
        <section className="mb-10">
          <h3 className="text-[15px] font-bold text-[#1A1A1A] mb-4">멘토링 가능 지역</h3>
          <div className="flex flex-wrap gap-2">
            {locationTags.length > 0 ? (
              locationTags.map((tag, idx) => (
                <span key={idx} className="bg-[#F8F9FA] text-[#333333] text-[14px] px-3.5 py-1.5 rounded-full border border-gray-100">
                  {tag}
                </span>
              ))
            ) : (
              <p className="text-gray-400 text-[14px] ml-1">정보가 없습니다</p>
            )}
          </div>
        </section>

        <section className="mb-4">
          <h3 className="text-[15px] font-bold text-[#1A1A1A] mb-4">멘토링 비용</h3>
          <div className="bg-[#F8F9FA] rounded-2xl p-5 flex items-center">
            <span className="text-[16px] font-bold text-[#1A1A1A]">{priceStr}</span>
          </div>
        </section>

      </div>

      <div className="absolute bottom-0 left-0 w-full bg-white px-5 py-3 pb-safe z-50">
        <button
          onClick={handleRegisterMentoring}
          disabled={isRegistering}
          className="w-full bg-[#111116] text-[white] font-bold text-[16px] py-4 rounded-xl hover:bg-black transition-colors active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isRegistering ? '사전상담 이어하기' : '사전상담 시작하기'}
        </button>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </main>
  );
}