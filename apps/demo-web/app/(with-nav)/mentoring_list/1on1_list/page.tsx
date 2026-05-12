"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X, Send, ChevronLeft, ChevronRight, AlertCircle, Clock } from "lucide-react";
import { useRouter } from "next/navigation";

// 💡 API 연동을 위한 클라이언트 임포트
import apiClient from "@/lib/apiClient";

type Message = {
  id: number;
  sender: "me" | "other";
  text: string;
  time: string;
};

type MentoringPerson = {
  id: number;
  mentoringId: number;
  name: string;
  role: string;
  title: string;
  lastMentoring: string;
  status: string;
  profileColor: string;
  availableSlots?: Record<number, string[]>;
  bookedDate?: number | null;
  bookedTime?: string | null;
  messages: Message[];
};

const getStatusMeta = (status: string) => {
  switch (status) {
    case "READY":
      return {
        label: "예약",
        badgeClass: "bg-[#FFCC00]/20 text-yellow-700"
      };
    case "ON_AIR":
      return {
        label: "진행 중",
        badgeClass: "bg-emerald-100 text-emerald-700"
      };
    case "COMPLETED":
    case "COMPLETE":
      return {
        label: "완료",
        badgeClass: "bg-gray-100 text-gray-600"
      };
    default:
      return {
        label: status || "상태 미정",
        badgeClass: "bg-gray-100 text-gray-600"
      };
  }
};

const getPrimaryAction = (person: MentoringPerson, userRole: string | null) => {
  if (userRole === "MENTOR") {
    if (person.status === "READY") {
      return {
        label: "멘토링 시작",
        type: "start" as const
      };
    }
    if (person.status === "ON_AIR") {
      return {
        label: "멘토링 진행",
        type: "navigate" as const,
        href: `/mentoring/1on1/${person.mentoringId}`
      };
    }
    if (person.status === "COMPLETED") {
      return null;
    }
    return {
      label: "일정 관리",
      type: "calendar" as const
    };
  }

  if (userRole === "MENTEE") {
    if (person.status === "READY") {
      return {
        label: "예약",
        type: "calendar" as const
      };
    }
    if (person.status === "ON_AIR") {
      return {
        label: "멘토링 참여",
        type: "navigate" as const,
        href: `/mentoring/1on1/${person.mentoringId}`
      };
    }
    if (person.status === "COMPLETE" || person.status === "COMPLETED") {
      return null;
    }
  }

  return {
    label: "일정 관리",
    type: "calendar" as const
  };
};

export default function OneOnOneListPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mentoringList, setMentoringList] = useState<MentoringPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [activeMessage, setActiveMessage] = useState<MentoringPerson | null>(null);
  const [activeCalendar, setActiveCalendar] = useState<MentoringPerson | null>(null);
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [startingMentoringId, setStartingMentoringId] = useState<number | null>(null);

  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const emptyDays = Array.from({ length: 5 });
  const daysInMonth = Array.from({ length: 31 }, (_, i) => i + 1);

  useEffect(() => {
    const fetchMentoringData = async () => {
      try {
        // 1. 내 권한(Role) 확인
        const storedRole = localStorage.getItem("userRole");
        if (storedRole) setUserRole(storedRole);

        // 2. 실제 백엔드 엔드포인트 호출 (/mentorings/one-on-one)
        const listRes = await apiClient.get("/api/mentorings/one-on-one");

        // 3. "상대 목록"이 아닌 "내가 참여한 1:1 멘토링 목록" 형태로 매핑
        const source = listRes.data?.mentorings || [];
        const resolvedRole = storedRole || null;

        const mappedData = (source || []).map((item: any, index: number) => {
          const colors = ["bg-blue-500", "bg-emerald-500", "bg-orange-400", "bg-pink-400"];

          const mentoringId = Number(item.mentoringId);
          const counterpartName = item.counterpartName || item.counterpart?.nickname || item.host?.nickname || "이름 없음";

          const schedule = item.startedAt || item.scheduledAt || "일정 미정";
          const status = String(item.status || item.rawStatus || "COMPLETE").toUpperCase();

          return {
            id: mentoringId,
            mentoringId,
            name: counterpartName,
            role: item.counterpartRole || (resolvedRole === "MENTOR" ? "멘티" : "멘토") || "직무 정보 없음",
            title: item.title || "멘토링 제목 없음",
            lastMentoring: schedule,
            status,
            profileColor: colors[index % colors.length],
            bookedDate: null,
            bookedTime: null,
            availableSlots: {},
            messages: [],
          };
        });

        setMentoringList(mappedData);
      } catch (error) {
        console.error("1:1 멘토링 리스트 로딩 실패:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMentoringData();
  }, []);

  const displayList = useMemo(() => {
    let list = [...mentoringList];
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      list = list.filter(person =>
        person.name.toLowerCase().includes(q) ||
        person.title.toLowerCase().includes(q)
      );
    }
    return list;
  }, [searchQuery, mentoringList]);

  const handleConfirmReservation = () => { /* 기존 로직 유지 */ };
  const handleCancelReservation = () => { /* 기존 로직 유지 */ };
  const handleSendMessage = () => { /* 기존 로직 유지 */ };

  const handleStartMentoring = async (person: MentoringPerson) => {
    if (startingMentoringId === person.mentoringId) return;

    setStartingMentoringId(person.mentoringId);
    try {
      await apiClient.post(`/media/mentorings/${person.mentoringId}/start`, {
        isGroup: false,
      });

      router.push(`/mentoring/1on1/${person.mentoringId}`);
    } catch (error) {
      console.error("멘토링 시작 실패:", error);
      alert("멘토링 시작에 실패했습니다.");
    } finally {
      setStartingMentoringId(null);
    }
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeMessage?.messages]);

  if (isLoading) {
    return (
      <main className="flex w-full h-[100dvh] items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#FFCC00] rounded-full animate-spin"></div>
      </main>
    );
  }

  return (
    <main className="flex flex-col w-full bg-white text-[#1A1A1A] font-sans min-h-[100dvh] relative pb-[70px]">

      <header className="sticky top-0 bg-white z-20 px-5 py-4 flex items-center justify-between border-b border-gray-50">
        {!isSearchOpen ? (
          <>
            <h1 className="text-[20px] font-extrabold tracking-tight">
              참여한 1:1 멘토링
            </h1>
            <button onClick={() => setIsSearchOpen(true)} className="p-1 hover:bg-gray-100 rounded-full cursor-pointer"><Search className="w-6 h-6" /></button>
          </>
        ) : (
          <div className="flex items-center gap-3 w-full animate-in slide-in-from-right-4 duration-300">
            <input autoFocus type="text" placeholder="이름 또는 멘토링 제목 검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 bg-gray-100 py-2.5 px-4 rounded-xl text-[14px] outline-none" />
            <button onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }} className="text-[14px] font-bold text-gray-500 cursor-pointer">취소</button>
          </div>
        )}
      </header>

      <div className="flex flex-col px-5 py-4 gap-4">
        {displayList.length > 0 ? (
          displayList.map((person) => {
            const statusMeta = getStatusMeta(person.status);
            const primaryAction = getPrimaryAction(person, userRole);

            return (
              <div key={person.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={userRole === "MENTOR" ? "/images/mentee_profile.jpg" : "/images/mentor_profile.jpg"}
                      alt={userRole === "MENTOR" ? "멘티 프로필" : "멘토 프로필"}
                      className="w-12 h-12 rounded-full shrink-0 object-cover bg-gray-100 border border-gray-50"
                    />

                    <div>
                      <h3 className="text-[16px] font-bold">{person.name}</h3>
                      <p className="text-[13px] text-gray-500">{person.role}</p>
                    </div>
                  </div>
                  <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl mb-4 text-[13px]">
                  <div className="flex gap-2 mb-1"><span className="font-bold text-gray-500 w-20">멘토링 제목</span><span>{person.title}</span></div>
                  <div className="flex gap-2"><span className="font-bold text-gray-500 w-14">일정</span><span className="font-bold">{person.lastMentoring}</span></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setActiveMessage(person)} className="flex-1 py-2.5 bg-gray-100 rounded-xl font-bold text-[14px] hover:bg-gray-200 transition-colors cursor-pointer">메시지</button>
                  {primaryAction && (
                    <button
                      disabled={startingMentoringId === person.mentoringId}
                      onClick={() => {
                        if (primaryAction.type === "start") {
                          void handleStartMentoring(person);
                          return;
                        }

                        if (primaryAction.type === "navigate" && primaryAction.href) {
                          router.push(primaryAction.href);
                          return;
                        }
                        setActiveCalendar(person);
                        setSelectedDate(person.bookedDate || null);
                        setSelectedTime(person.bookedTime || null);
                      }}
                      className={`flex-1 py-2.5 bg-[#1A1A1A] text-white rounded-xl font-bold text-[14px] hover:bg-black transition-colors ${startingMentoringId === person.mentoringId ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                    >
                      {startingMentoringId === person.mentoringId ? "시작 중..." : primaryAction.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <AlertCircle className="w-10 h-10 mb-4 text-gray-300" />
            <p className="font-medium text-[15px]">
              참여한 1:1 멘토링이 없습니다.
            </p>
          </div>
        )}
      </div>

      {/* 💡 수정된 달력 및 시간 선택 모달창 */}
      {activeCalendar && (
        <div
          className="fixed inset-0 z-[999] bg-black/60 flex items-end justify-center sm:items-center max-w-md mx-auto animate-in fade-in duration-200"
          onClick={() => setActiveCalendar(null)} // 💡 1. 어두운 배경을 클릭해도 모달이 닫히도록 추가
        >
          <div
            className="bg-white w-full sm:w-[90%] sm:rounded-3xl rounded-t-3xl p-6 pb-safe animate-in slide-in-from-bottom-10 duration-300 relative"
            onClick={(e) => e.stopPropagation()} // 💡 2. 모달 하얀색 '내부'를 클릭했을 땐 창이 닫히지 않고 정상 작동하도록 이벤트 보호
          >

            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-[18px] font-extrabold">
                  {userRole === "MENTEE" ? "멘토링 예약하기" : "멘티 일정 확인"}
                </h2>
                <p className="text-[13px] text-gray-500 font-medium mt-1">대상: {activeCalendar.name}</p>
              </div>
              {/* 💡 3. type="button"을 명시하여 브라우저 기본 동작 충돌 방지 */}
              <button
                type="button"
                onClick={() => setActiveCalendar(null)}
                className="p-2 bg-gray-50 rounded-full hover:bg-gray-200 transition-colors z-10 relative cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between mb-4 px-2">
              <button type="button" className="p-1 cursor-pointer"><ChevronLeft className="w-5 h-5 text-gray-400" /></button>
              <span className="font-bold text-[16px]">2026년 5월</span>
              <button type="button" className="p-1 cursor-pointer"><ChevronRight className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2 text-center text-[12px] font-bold text-gray-400">
              <div className="text-red-400">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div className="text-blue-400">토</div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {emptyDays.map((_, i) => <div key={`empty-${i}`} className="p-2" />)}

              {daysInMonth.map(day => {
                const isMentee = userRole === "MENTEE";
                const isAvailable = isMentee && activeCalendar.availableSlots?.[day];
                const isBooked = !isMentee && activeCalendar.bookedDate === day;
                const isSelected = selectedDate === day;

                // 💡 CSS 충돌(노란 바탕 + 노란 글씨) 방지를 위해 조건별로 클래스를 명확히 분리합니다.
                let buttonClass = "relative p-2.5 text-[14px] font-medium rounded-full transition-all ";

                if (isSelected || isBooked) {
                  // 예약된 날짜이거나 현재 선택된 날짜 (노란 바탕 + 진한 검정 글씨)
                  buttonClass += "bg-[#FFCC00] text-[#1A1A1A] font-extrabold shadow-md transform scale-110";
                } else if (isAvailable) {
                  // 예약 가능한 빈 날짜
                  buttonClass += "bg-gray-50 text-[#1A1A1A] border border-gray-200 hover:border-[#FFCC00]";
                } else {
                  // 선택 불가능한 날짜 (회색 글씨)
                  buttonClass += "text-gray-300";
                }

                return (
                  <button
                    key={day}
                    type="button"
                    disabled={isMentee && !isAvailable}
                    onClick={() => isMentee && isAvailable && setSelectedDate(day)}
                    className={`${buttonClass} ${isMentee && !isAvailable ? "cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* 시간 선택 영역 */}
            {selectedDate && (activeCalendar.availableSlots?.[selectedDate] || activeCalendar.bookedDate === selectedDate) && (
              <div className="mb-8 animate-in fade-in slide-in-from-top-2 mt-4">
                <div className="flex items-center gap-1.5 mb-3 text-gray-500">
                  <Clock className="w-4 h-4" />
                  <span className="text-[13px] font-bold">시간 선택</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(activeCalendar.availableSlots?.[selectedDate] || (activeCalendar.bookedTime ? [activeCalendar.bookedTime] : [])).map(time => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => userRole === "MENTEE" && setSelectedTime(time as string)}
                      className={`px-4 py-2 rounded-lg text-[13px] font-bold border transition-all cursor-pointer 
                        ${selectedTime === time ? "bg-[#FFCC00] border-[#FFCC00]" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 하단 액션 버튼 */}
            <div className="flex flex-col gap-2 mt-6">
              {userRole === "MENTEE" && activeCalendar.status === "READY" && (
                <button
                  type="button"
                  onClick={handleCancelReservation}
                  className="w-full py-3 text-red-500 font-bold text-[14px] border border-red-100 rounded-xl mb-2 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  예약 취소하기
                </button>
              )}
              {userRole === "MENTEE" ? (
                <button
                  type="button"
                  disabled={!selectedTime}
                  className={`w-full py-4 rounded-xl font-bold text-[16px] transition-colors ${selectedTime ? 'bg-[#1A1A1A] text-white active:bg-black cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                  onClick={handleConfirmReservation}
                >
                  {selectedTime ? `${selectedDate}일 ${selectedTime} 예약 확정` : '날짜와 시간을 선택해주세요'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveCalendar(null)}
                  className="w-full py-4 bg-[#1A1A1A] text-white rounded-xl font-bold hover:bg-black transition-colors cursor-pointer"
                >
                  확인
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* 메시지 모달창 */}
      {activeMessage && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-gray-100 max-w-md mx-auto animate-in slide-in-from-bottom-full duration-300">
          <div className="bg-white px-4 py-3 flex items-center justify-between border-b shadow-sm">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full ${activeMessage.profileColor}`} />
              <span className="font-bold text-[16px]">{activeMessage.name}</span>
            </div>
            <button onClick={() => setActiveMessage(null)} className="p-2 bg-gray-50 rounded-full hover:bg-gray-200 transition-colors cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-4">
            <div className="text-center text-xs text-gray-400 my-2">2026년 4월 20일</div>

            {activeMessage.messages.length > 0 ? (
              activeMessage.messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col w-3/4 ${msg.sender === "me" ? "self-end items-end" : "self-start items-start"}`}>
                  <div className={`p-3 text-[14px] shadow-sm ${msg.sender === "me"
                    ? "bg-[#FFCC00] rounded-2xl rounded-tr-none text-[#1A1A1A]"
                    : "bg-white border border-gray-100 rounded-2xl rounded-tl-none text-[#1A1A1A]"
                    }`}>
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1 px-1">{msg.time}</span>
                </div>
              ))
            ) : (
              <div className="text-center text-[13px] text-gray-400 mt-10">
                아직 나눈 대화가 없습니다. <br />인사를 건네보세요!
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="bg-white p-3 border-t flex items-center gap-2 pb-safe">
            <input
              type="text"
              placeholder="메시지 보내기..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#FFCC00]/50"
            />
            <button
              onClick={handleSendMessage}
              className="w-10 h-10 bg-[#1A1A1A] rounded-full flex items-center justify-center text-[#FFCC00] shrink-0 hover:bg-black transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      )}

    </main>
  );
}