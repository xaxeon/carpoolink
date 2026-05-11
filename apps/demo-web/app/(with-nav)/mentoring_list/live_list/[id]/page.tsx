"use client";

import { useRouter } from "next/navigation";

export default function DummyLiveDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center h-[100dvh] bg-white">
      <h1 className="text-2xl font-bold mb-4">{params.id}번 라이브 방송</h1>
      <p className="text-gray-500 mb-8">현재 상세 페이지 개발 중입니다 🛠️</p>
      
      <button 
        onClick={() => router.back()}
        className="px-6 py-3 bg-[#FFCC00] text-[#1A1A1A] font-bold rounded-xl"
      >
        뒤로 가기 테스트
      </button>
    </div>
  );
}