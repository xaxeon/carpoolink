// src/types/api.ts

// 💡 성공적인 응답의 기본 형태
export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
}

// 💡 에러 응답의 기본 형태
export interface ApiError {
  success: boolean;
  message: string;
  error?: any;
}