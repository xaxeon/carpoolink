# 1단계: 빌드
FROM node:22-bookworm-slim AS build

WORKDIR /app

# 빌드 의존성
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip build-essential pkg-config openssl ca-certificates \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# 의존성 설치
COPY package.json package-lock.json ./
COPY services ./services
COPY packages ./packages
RUN npm ci --workspace services/question-service --include-workspace-root
RUN npx prisma generate --schema=./packages/database/prisma/schema.prisma || true

# 실행 워크스페이스로 이동
WORKDIR /app/services/question-service

# 2단계: 실행
FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Seoul
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 빌드 결과물 복사
COPY --from=build /app /app

WORKDIR /app/services/question-service

EXPOSE 4003

CMD ["npm", "start"]
