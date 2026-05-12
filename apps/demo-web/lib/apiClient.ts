import axios from 'axios';

// 1. Core API 클라이언트 생성 (환경 변수 적용)
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:4000',
  headers: {
    'Content-Type': 'application/json',
  },
  //withCredentials: true,
});

// 2. 요청 인터셉터 (Request Interceptor): API를 쏠 때마다 헤더에 userId를 챙겨 넣음
// apiClient.ts 내부의 요청 인터셉터 부분
apiClient.interceptors.request.use((config) => {
  const userId = localStorage.getItem('userId');

  if (userId && !config.headers['x-user-id']) {
    config.headers['x-user-id'] = userId;
  }

  return config;
});

// 3. 응답 인터셉터 (Response Interceptor): 지우면 안 되는 부분! 백엔드에서 쫓겨나면 로그인 창으로 보냄
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // 💡 401(Unauthorized) 또는 403(Forbidden) 에러 처리 로직
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      if (typeof window !== 'undefined') {
        console.warn('인증이 만료되었거나 권한이 없습니다. 다시 로그인해 주세요.');
        localStorage.removeItem('accessToken'); // 토큰 지우기
        localStorage.removeItem('userId');      // ID 지우기
        window.location.href = '/login';        // 로그인 페이지로 강제 이동
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;