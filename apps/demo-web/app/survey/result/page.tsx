"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  ChevronLeft, ArrowRight,
  // 💡 심볼용 16가지 아이콘
  ChessKnight, BookHeart, Plane, Sparkles, Target, 
  Car, Sprout, BookOpen, Hammer, Wrench, Eye, 
  FlaskConical, Brain, Handshake, Leaf, Compass,
  // 💡 그리드 카드용 아이콘 추가
  Briefcase, Search, MessageCircleQuestion, Map
} from "lucide-react";

import apiClient from "@/lib/apiClient";

// 💡 16가지 결과 유형에 따른 심볼 아이콘 매핑 딕셔너리
const resultIconMap: Record<string, React.ReactNode> = {
  "야망의 야생마": <ChessKnight className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "공감형 전략가": <BookHeart className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "사교적인 여행가": <Plane className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "트렌드 헌터": <Sparkles className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "불도저 스나이퍼": <Target className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "열정의 레이서": <Car className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "호기심 꿈나무": <Sprout className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "지식 다이버": <BookOpen className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "철갑의 장인": <Hammer className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "묵직한 해결사": <Wrench className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "조용한 관찰자": <Eye className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "자유로운 연구원": <FlaskConical className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "냉철한 분석가": <Brain className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "든든한 파트너": <Handshake className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "낭만적인 산책자": <Leaf className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
  "창의적인 모험가": <Compass className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />
};

export default function SurveyResultPage() {
  const router = useRouter();
  
  const [surveyTitle, setSurveyTitle] = useState("");
  const [userAnswers, setUserAnswers] = useState<any[]>([]);
  const [combinationCode, setCombinationCode] = useState(""); // 💡 "AABB" 같은 조합 코드를 저장할 State
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. 방금 설문을 풀고 넘어왔다면 localStorage에 데이터가 있습니다.
    const storedData = localStorage.getItem("surveyResultData");

    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        setSurveyTitle(parsedData.result?.title || "알 수 없는 유형");
        setUserAnswers(parsedData.answers || []); 
        // 💡 백엔드가 넘겨준 combinationCode (예: "BAAB")를 저장합니다.
        setCombinationCode(parsedData.result?.combinationCode || ""); 
        setIsLoading(false);
      } catch (error) {
        console.error("데이터 파싱 오류:", error);
        fetchFromApi(); 
      }
    } else {
      // 2. 직접 접근 시 API 폴백
      fetchFromApi();
    }
  }, []);

  const fetchFromApi = async () => {
    try {
      const res = await apiClient.get("/users/me");
      const title = res.data.menteeProfile?.surveyResult;
      setSurveyTitle(title || "아직 설문 결과가 없습니다.");
    } catch (error) {
      setSurveyTitle("결과를 불러올 수 없습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 💡 문항 번호(stepIndex)와 사용자의 선택(A 또는 B)에 따라 알맞은 아이콘을 반환하는 함수
  const getGridIcon = (stepIndex: number, codeChar: string) => {
    // A는 첫 번째 선택지(-1), B는 두 번째 선택지(-2)로 매핑됩니다.
    switch (stepIndex) {
      case 0: // 1번 문항
        return codeChar === "A" ? <Briefcase className="w-8 h-8 text-[#FFCC00] mb-3" strokeWidth={2} /> : <Search className="w-8 h-8 text-[#FFCC00] mb-3" strokeWidth={2} />;
      case 1: // 2번 문항
        return codeChar === "A" ? <MessageCircleQuestion className="w-8 h-8 text-[#FFCC00] mb-3" strokeWidth={2} /> : <Compass className="w-8 h-8 text-[#FFCC00] mb-3" strokeWidth={2} />;
      case 2: // 3번 문항
        return codeChar === "A" ? <img src="/icons/zap.svg" alt="번개 아이콘" className="w-8 h-8 mb-3" /> : <img src="/icons/heart.svg" alt="하트 아이콘" className="w-8 h-8 mb-3" />;
      case 3: // 4번 문항
        return codeChar === "A" ? <img src="/icons/map_pin.svg" alt="맵핀 아이콘" className="w-8 h-8 mb-3" /> : <Map className="w-8 h-8 text-[#FFCC00] mb-3" strokeWidth={2} />;
      default:
        return <Briefcase className="w-8 h-8 text-[#FFCC00] mb-3" strokeWidth={2} />; // 기본값
    }
  };

  const SymbolIcon = resultIconMap[surveyTitle] || <Compass className="w-8 h-8 text-[#FFCC00]" />;

  return (
    <main className="flex flex-col w-full h-[100dvh] bg-[#F8F9FA] relative font-sans">
      
      <header className="w-full bg-white px-4 py-4 flex items-center">
        <button onClick={() => router.push("/")} className="inline-flex items-center hover:opacity-80 transition-opacity">
          <ChevronLeft className="w-6 h-6 mr-1 text-[#FFCC00]" />
          <span className="text-[#2F2F2F] font-medium text-lg">홈으로</span>
        </button>
      </header>

      <div className="flex flex-col flex-1 px-6 pt-10 pb-6 overflow-hidden justify-start">
        
        {/* [상단 영역] 심볼 및 동적 타이틀 */}
        <div className="flex flex-col items-center shrink-0 min-h-[140px]">
          <div className="w-16 h-16 bg-[#1A1A1A] rounded-full flex items-center justify-center shadow-lg mb-4 animate-in zoom-in duration-500">
            {SymbolIcon}
          </div>
          <span className="text-[14px] font-semibold text-[#666666] mb-1">
            당신의 멘토링 유형은?
          </span>
          
          {isLoading ? (
            <div className="h-10 mt-2 flex items-center justify-center">
              <div className="w-6 h-6 border-4 border-gray-200 border-t-[#FFCC00] rounded-full animate-spin"></div>
            </div>
          ) : (
            <h1 className="text-[32px] font-extrabold text-[#1A1A1A] tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-500 text-center break-keep">
              {surveyTitle}
            </h1>
          )}
        </div>

        {/* [중단 영역] 사용자가 선택한 답변 기반 동적 그리드 카드 */}
        <div className="w-full grid grid-cols-2 gap-3 my-auto shrink-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {userAnswers.length > 0 ? (
            userAnswers.map((item, index) => {
              // 💡 조합 코드(예: "BAAB")에서 현재 인덱스의 글자('A' 또는 'B')를 추출하여 아이콘 매핑 함수에 전달합니다.
              const codeChar = combinationCode[index] || "A"; 
              
              return (
                <div key={index} className="bg-white rounded-2xl py-8 flex flex-col items-center justify-center shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08)]">
                  {/* 💡 계산된 맞춤형 아이콘 렌더링 */}
                  {getGridIcon(index, codeChar)}
                  <span className="text-[14px] font-bold text-[#2F2F2F] text-center px-2 break-keep">
                    {item.answer}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="col-span-2 text-center text-gray-400 py-10 text-sm">
              상세 선택 내역을 불러올 수 없습니다.
            </div>
          )}
        </div>

        {/* [하단 영역] 설명 및 버튼 */}
        <div className="w-full flex flex-col items-center shrink-0">
          <p className="text-[#666666] font-medium text-[14px] text-center leading-relaxed break-keep mb-10">
            당신의 유형을 바탕으로 딱 맞는<br />
            카풀링 멘토링 서비스를 제공할게요.
          </p>
          <button 
            onClick={() => {
              localStorage.removeItem("surveyResultData");
              router.push("/");
            }} 
            className="w-full bg-[#FFCC00] text-[#1A1A1A] font-semibold text-[17px] py-4 rounded-2xl flex items-center justify-center shadow-lg hover:bg-[#E6B800] active:scale-[0.98] transition-all"
          >
            나의 멘토 찾기
            <ArrowRight className="w-5 h-5 ml-2" strokeWidth={2.5} />
          </button>
        </div>

      </div>
    </main>
  );
}