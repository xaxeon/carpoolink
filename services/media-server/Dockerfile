# 1단계: 빌드
FROM node:22-alpine AS build

WORKDIR /app

# mediasoup prebuilt 실패 시 로컬 빌드를 위한 의존성
RUN apk add --no-cache python3 py3-pip make g++ linux-headers && ln -sf python3 /usr/bin/python

# 의존성 설치
COPY package.json package-lock.json ./
COPY services ./services
COPY packages ./packages
RUN npm ci --workspace services/media-server --include-workspace-root

# 실행 워크스페이스로 이동
WORKDIR /app/services/media-server

# 2단계: 실행
FROM node:22-alpine
WORKDIR /app

ENV TZ=Asia/Seoul
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 빌드 결과물 복사
COPY --from=build /app /app

WORKDIR /app/services/media-server

EXPOSE 4002

CMD ["npm", "start"]
