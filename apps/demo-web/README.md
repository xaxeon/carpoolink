# Carpoolink Online Frontend (demo-web)
 
Carpoolink 온라인 멘토링 서비스 프론트엔드입니다.

## 주요 기능 (Key Features)

### 1. 실시간 화상/음성 멘토링 (WebRTC)
- **1:N 라이브 멘토링 (`/mentoring/live`)**: MediaSoup 기반의 일대다 스트리밍. 멘토와 멘티의 역할을 철저히 분리하여 멘토 주도의 방송 환경 제공.
- **1:1 프라이빗 멘토링 (`/mentoring/private`)**: 멘토와 멘티 단 둘이 진행하는 심층 오디오 전용 멘토링 환경.

### 2. STT 기반 스마트 음성 제어 (Voice Command)
- 마우스나 키보드 조작 없이 멘토의 **음성 발화만으로 프론트엔드 UI와 미디어 서버 상태를 제어**합니다.
- **"질문 듣기" / "다시 듣기"**: 대기 중인 질문을 TTS가 읽어주며, 비공개 질문일 경우 질문자 외 다른 멘티들의 스피커를 즉시 차단(Mute)합니다.
- **"답변 완료"**: 해당 질문을 DB에서 완료 처리하고, 차단되었던 멘티들의 음성 수신을 재개(Resume)하여 라이브 방송으로 복귀합니다.

### 3. AI 실시간 질문 관리 시스템 (Context-Aware Q&A)
- 멘토링 주제, 멘토/멘티의 정보, 멘토의 현재 설명 내용(STT 스크립트)과 멘티들의 채팅 흐름을 AI가 실시간으로 분석합니다.
- 멘토에게는 현재 상황에 가장 답변하기 적합한 질문을 상위로 랭크하여 표시합니다.
- 멘티에게는 현재 상황에 가장 적합한 꼬리 질문(Follow-up), 개념 확인, 원리 파악 등의 맞춤형 질문을 팝업 형태로 추천하여 멘티의 능동적인 참여를 유도합니다. (팝업 오버레이 UX 적용)

### 4. 멘토링 스크립트 편집/열람
- 멘토링 중 발화된 모든 내용은 청크 단위로 분할되어 텍스트로 변환됩니다.
- 멘토링이 종료된 후 멘토는 `/script/[id]` 페이지에서 전체 대화 스크립트를 편집할 수 있습니다.
- 멘토가 스크립트를 발행하면 해당 멘토링에 참여했던 멘티는 스크립트 열람이 가능합니다.

### 5. 맞춤형 사전 설문
- 멘티 회원가입 직후 `/survey` 페이지를 통해 4단계(Step 1~4)에 걸친 기술 스택 및 성향 설문을 진행하여 멘티의 성향을 파악하고 최적의 멘토를 매칭할 데이터를 수집합니다.

---

## 기술 스택 (Tech Stack)

- **Framework**: Next.js 15 (App Router), React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Real-time Communication**: 
  - `socket.io-client` (채팅 및 시그널링)
  - `mediasoup-client` (WebRTC 미디어 스트리밍)
- **Icons**: Lucide-react

---

## 폴더 구조 (Directory Structure)

```text
demo-web/
├── app/                        # Next.js App Router 기반 페이지 및 레이아웃
│   ├── (with-nav)/             # 글로벌 네비게이션(GNB)이 포함된 서비스 레이아웃
│   │   ├── mentoring/          # 멘토링 목록 (live, 1on1)
│   │   ├── mypage/             # 마이페이지
│   │   └── scripts/            # 스크립트 보관함 목록
│   ├── login/                  # 로그인 페이지
│   ├── mentor/[id]/            # 멘토 상세 프로필 페이지
│   ├── mentoring/              # 실시간 멘토링 세션 (핵심 도메인)
│   │   ├── live/mentor/        # 1:N 라이브 - 멘토 송출 화면
│   │   ├── live/mentee/        # 1:N 라이브 - 멘티 시청 화면
│   │   └── private/            # 1:1 프라이빗 멘토링 화면
│   ├── script/[id]/            # 멘토링 종료 후 상세 STT 스크립트 뷰어
│   └── survey/                 # 멘티 온보딩 사전 설문 (step1 ~ step4)
├── hooks/                      # 공통 비즈니스 로직 및 상태 관리 (Custom Hooks)
│   ├── useMentoringSession.ts  # 소켓 연결 및 시그널링, 메시징 관리
│   └── useWebRtcSession.ts     # MediaSoup 기반 하드웨어(마이크/캠) 제어 및 미디어 스트림 관리
├── lib/                        # 전역 유틸리티 및 설정
│   └── apiClient.ts            # Axios 기반 API 클라이언트 (인터셉터 포함)
├── public/                     # 정적 에셋 (로고, 아이콘, 이미지 등)
├── types/                      # TypeScript 전역 타입 정의
├── .env.local                  # 프론트엔드 환경 변수
├── next.config.ts              # Next.js 설정 파일
├── tailwind.config.ts          # Tailwind CSS 디자인 시스템 설정
└── package.json                # 프로젝트 의존성 관리

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
