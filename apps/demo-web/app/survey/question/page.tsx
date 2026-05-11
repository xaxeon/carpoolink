"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  ChevronLeft, 
  Briefcase, 
  Search, 
  MessageCircleQuestion, 
  Compass, 
  Map 
} from "lucide-react";

import apiClient from "@/lib/apiClient";

export default function SurveyPage() {
  const router = useRouter();
  
  const [questions, setQuestions] = useState<any[]>([]); 
  const [currentStep, setCurrentStep] = useState(0);     
  const [answers, setAnswers] = useState<Record<string, string>>({}); 
  
  const [progressWidth, setProgressWidth] = useState("0%");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const iconMap = [
    // Step 1
    [
      <Briefcase key="1-1" className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
      <Search key="1-2" className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />
    ],
    // Step 2
    [
      <MessageCircleQuestion key="2-1" className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />,
      <Compass key="2-2" className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />
    ],
    // Step 3
    [
      <img key="3-1" src="/icons/zap.svg" alt="번개 아이콘" className="w-8 h-8" />,
      <img key="3-2" src="/icons/heart.svg" alt="하트 아이콘" className="w-8 h-8" />
    ],
    // Step 4
    [
      <img key="4-1" src="/icons/map_pin.svg" alt="맵핀 아이콘" className="w-8 h-8" />,
      <Map key="4-2" className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />
    ]
  ];

  useEffect(() => {
    const fetchSurveys = async () => {
      try {
        const response = await apiClient.get("/api/surveys");
        setQuestions(response.data.surveyQuestions || []);
      } catch (error) {
        console.error("설문 데이터 로딩 실패:", error);
        alert("설문 데이터를 불러오지 못했습니다.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchSurveys();
  }, []);

  useEffect(() => {
    if (questions.length > 0) {
      const timer = setTimeout(() => {
        const percentage = ((currentStep + 1) / questions.length) * 100;
        setProgressWidth(`${percentage}%`);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentStep, questions.length]);

  // 💡 수정된 부분: 옵션 선택 및 제출 로직
  const handleOptionSelect = async (questionCode: string, optionCode: string) => {
    const updatedAnswers = { ...answers, [questionCode]: optionCode };
    setAnswers(updatedAnswers);

    if (currentStep < questions.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // 마지막 문항일 경우 로딩(제출 중) 상태로 변경
      setIsSubmitting(true);
      try {
        // 1. 백엔드에 사용자의 모든 답변을 전송하여 저장 및 유형 판정 완료
        const res = await apiClient.post("/api/surveys/submit", { answers: updatedAnswers });
        
        // 2. 💡 [추가된 코드] 백엔드에서 받은 결과(유형 제목 + 4가지 선택 답변)를 로컬 스토리지에 저장!
        localStorage.setItem("surveyResultData", JSON.stringify(res.data));

        // 3. alert 창을 없애고 곧바로 로딩 페이지로 이동!
        router.push("/survey/loading"); 
      } catch (error) {
        console.error("설문 제출 실패:", error);
        alert("설문 제출 중 오류가 발생했습니다.");
        setIsSubmitting(false); // 에러가 났을 때만 다시 버튼을 누를 수 있게 풀어줌
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1); 
    } else {
      router.back(); 
    }
  };

  if (isLoading) {
    return (
      <main className="flex w-full h-[100dvh] items-center justify-center bg-[#F8F9FA]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#FFCC00] rounded-full animate-spin"></div>
      </main>
    );
  }

  if (questions.length === 0) return <div>설문 데이터가 없습니다.</div>;

  const currentQuestion = questions[currentStep];

  return (
    <main className="flex flex-col w-full h-[100dvh] bg-[#F8F9FA] relative font-sans">
      
      <header className="w-full bg-white px-4 py-4 flex items-center">
        <button onClick={handlePrevious} disabled={isSubmitting} className="inline-flex items-center hover:opacity-80 transition-opacity disabled:opacity-50">
          <ChevronLeft className="w-6 h-6 mr-1 text-[#FFCC00]" />
          <span className="text-[#2F2F2F] font-medium text-lg">이전</span>
        </button>
      </header>

      <div className="flex flex-col flex-1 px-6 pt-18 pb-8">
        
        <h1 className="text-2xl sm:text-[28px] font-bold text-[#1A1A1A] text-center mb-10 tracking-tight break-keep">
          {currentQuestion.content || `질문 ${currentStep + 1}`}
        </h1>

        <div className="flex flex-col gap-5 mb-auto">
          {currentQuestion.options.map((option: any, index: number) => {
            const iconElement = iconMap[currentStep]?.[index] || <Briefcase className="w-8 h-8 text-[#FFCC00]" strokeWidth={2} />;
            
            return (
              <button
                key={option.code}
                onClick={() => handleOptionSelect(currentQuestion.code, option.code)}
                disabled={isSubmitting}
                className="w-full bg-white rounded-3xl p-6 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.08)] flex items-start gap-5 border-2 border-transparent hover:border-[#FFCC00] active:scale-[0.98] transition-all text-left disabled:opacity-70 disabled:cursor-wait"
              >
                <div className="w-16 h-16 rounded-2xl bg-[#2F2F2F] flex items-center justify-center shrink-0">
                  {iconElement}
                </div>
                
                <div className="flex flex-col pt-1">
                  <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">{option.label}</h2>
                  {option.description && (
                    <p className="text-[#666666] text-[15px] leading-relaxed break-keep">
                      {option.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="w-full flex flex-col items-center mt-12 pb-4">
          <div className="w-full h-2 bg-[#E5E7EB] rounded-full overflow-hidden mb-4">
            <div 
              className="h-full bg-[#FFCC00] rounded-full transition-all duration-700 ease-out"
              style={{ width: progressWidth }}
            ></div>
          </div>
          <span className="text-[15px] font-medium text-[#666666]">
            {currentStep + 1} / {questions.length}
          </span>
        </div>

      </div>
    </main>
  );
}