"use client";

import { useState, useEffect } from "react";
import apiClient from "@/lib/apiClient"; // 💡 앞서 만든 apiClient 경로에 맞게 수정하세요.

export default function ApiTestPage() {
  const [status, setStatus] = useState<string>("테스트 대기 중...");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const testConnection = async () => {
      setStatus("연결 시도 중... ⏳");
      try {
        // 💡 core-api에 실제로 존재하는 아무 엔드포인트나 호출해봅니다. (예: 마이페이지 정보 또는 멘토링 목록)
        // 만약 /users/me 라우트가 있다면 아래처럼 적습니다.
        const response = await apiClient.get("/users/me"); 
        
        setStatus("✅ 통신 성공!");
        setData(response.data);
      } catch (error: any) {
        setStatus("❌ 통신 실패");
        // 에러 메시지 상세 출력
        setData(error.response?.data || error.message);
      }
    };

    testConnection();
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>API 통신 테스트 페이지</h1>
      <h2 style={{ color: status.includes("성공") ? "green" : status.includes("실패") ? "red" : "black" }}>
        {status}
      </h2>
      
      <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#3D3D3D", borderRadius: "8px" }}>
        <h3>응답 결과:</h3>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}