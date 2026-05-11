# 1단계: 빌드
FROM node:22-bookworm-slim AS build

WORKDIR /app

# mediasoup prebuilt 실패 시 로컬 빌드를 위한 의존성
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip make g++ pkg-config openssl ca-certificates \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# 의존성 설치
COPY package.json package-lock.json ./
COPY services/media-server/package.json ./services/media-server/
COPY packages ./packages

RUN npm ci --workspace services/media-server --include-workspace-root
RUN npx prisma generate --schema=./packages/database/prisma/schema.prisma || true

# 코드 복사
COPY services/media-server/ ./services/media-server/

# 실행 워크스페이스로 이동
WORKDIR /app/services/media-server

# 2단계: 실행
FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Seoul
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 빌드 결과물 복사
COPY --from=build /app /app

WORKDIR /app/services/media-server

EXPOSE 4002

CMD ["npm", "start"]
