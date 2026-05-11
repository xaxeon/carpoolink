# Carpoolink

기 구축된 오프라인 중심 현직자 멘토링 매칭 플랫폼(이하 ‘카풀링’)을 온라인 실시간 소통형 멘토링으로 확장하기 위한 모노레포 프로젝트입니다.

## Monorepo 구조

```text
apps/
	demo-web/
services/
	mentoring-session/
	sfu-server/
	audio-router/
	live-chat/
	question-queue/
	voice-command/
	drm-guard/
packages/
	contracts/
	sdk-client/
	common/
docs/
	api/
	guides/
	architecture/
tests/
	integration/
	e2e/
	load/
```

## 빠른 시작

### 1. 환경 설정

```bash
# 프로젝트 루트에서
npm install
cp .env.example .env
```

### 2. Docker Compose로 모든 서비스 실행

```bash
cd infra/compose
docker-compose up -d

# 상태 확인
docker-compose ps
```

### 3. 웹 애플리케이션 실행

```bash
cd apps/demo-web
npm run dev
```

### 4. 개별 서비스 개발

```bash
# Core API
cd services/core-api && npm run dev

# Chat Service
cd services/chat-service && npm run dev

# 다른 서비스도 동일하게
```

## 배포

자동 배포는 main 브랜치로 push 시 GitHub Actions를 통해 자동 실행됩니다.

- **배포 가이드**: [infra/compose/DEPLOYMENT_GUIDE.md](./infra/compose/DEPLOYMENT_GUIDE.md)
- **시크릿 설정**: [.github/SECRETS_SETUP.md](./.github/SECRETS_SETUP.md)
- **로컬 개발**: [infra/compose/README.md](./infra/compose/README.md)