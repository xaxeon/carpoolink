# 1단계: 빌드
FROM node:20-alpine AS build

WORKDIR /app

# 의존성 설치
COPY package.json package-lock.json ./
COPY services ./services
COPY packages ./packages
RUN npm ci --workspace services/question-service --include-workspace-root

# 실행 워크스페이스로 이동
WORKDIR /app/services/question-service

# 2단계: 실행
FROM node:20-alpine
WORKDIR /app

ENV TZ=Asia/Seoul
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 빌드 결과물 복사
COPY --from=build /app /app

WORKDIR /app/services/question-service

EXPOSE 4003

CMD ["npm", "start"]
