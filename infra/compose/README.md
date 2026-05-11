# Compose - 로컬 개발 환경 설정

Carpoolink의 모든 마이크로서비스와 데이터베이스를 Docker Compose로 로컬 환경에서 실행합니다.

## 빠른 시작

### 1. 환경 변수 설정

```bash
cd infra/compose

# .env 파일 생성

### 2. 서비스 시작

```bash
# 모든 서비스 시작
docker-compose up -d

# 상태 확인
docker-compose ps

# 특정 서비스 로그 보기
docker-compose logs -f core-api
```

### 3. 서비스 중지

```bash
# 모든 서비스 중지
docker-compose down

# 데이터를 포함하여 완전히 제거
docker-compose down -v
```

## 서비스 포트 매핑

| 서비스 | 포트 | URL |
|--------|------|-----|
| PostgreSQL | 5432 | `postgresql://localhost:5432/carpoolink` |
| Core API | 4000 | `http://localhost:4000` |
| Chat Service | 4001 | `ws://localhost:4001` |
| Media Server | 4002 | `ws://localhost:4002` |
| Question Service | 4003 | `http://localhost:4003` |
| STT Service | 4004 | `http://localhost:4004` |

## 개별 서비스 관리

### 특정 서비스만 시작

```bash
# Core API만 시작
docker-compose up -d core-api

# 여러 서비스 시작
docker-compose up -d core-api chat-service
```

### 특정 서비스 로그 보기

```bash
# 실시간 로그
docker-compose logs -f chat-service

# 마지막 100줄
docker-compose logs --tail=100 core-api

# 모든 서비스 로그
docker-compose logs
```

### 특정 서비스 재시작

```bash
# 서비스 재시작
docker-compose restart media-server

# 컨테이너 재빌드 및 시작
docker-compose up -d --build stt-service
```

## 데이터베이스 관리

### PostgreSQL 접속

```bash
# psql CLI 사용
docker-compose exec postgres psql -U carpoolink -d carpoolink

# 또는 로컬 클라이언트 사용
psql postgresql://carpoolink:password@localhost:5432/carpoolink
```

### 데이터베이스 초기화

```bash
# 데이터 유지하고 서비스만 재시작
docker-compose restart postgres

# 모든 데이터 삭제하고 새로 시작
docker-compose down -v
docker-compose up -d postgres
```

## 환경 변수 관리


### 환경 변수 변경 후

```bash
# 변경사항 적용
docker-compose down
docker-compose up -d --build
```

## 문제 해결

### 포트 충돌 오류

```
Error: driver failed programming external connectivity
```

**해결 방법**:
```bash
# 충돌하는 프로세스 확인
sudo lsof -i :5432  # PostgreSQL
sudo lsof -i :4000  # Core API

# 프로세스 종료
sudo kill -9 <PID>
```

### 컨테이너 시작 실패

```bash
# 로그 확인
docker-compose logs

# 컨테이너 정리
docker-compose down -v
docker system prune -a

# 다시 시작
docker-compose up -d
```

### 데이터베이스 연결 오류

```bash
# 데이터베이스 상태 확인
docker-compose exec postgres pg_isready -U carpoolink

# 서비스에서 재시도
docker-compose restart core-api
```

### 메모리 부족

```bash
# Docker 리소스 정리
docker system prune -a --volumes

# 또는 불필요한 이미지 삭제
docker rmi <image-id>
```

## 디버깅

### 특정 서비스 쉘 접속

```bash
# Core API 컨테이너 쉘 접속
docker-compose exec core-api sh

# 또는 bash
docker-compose exec core-api bash
```

### 네트워크 확인

```bash
# 네트워크 상태 확인
docker network inspect carpoolink-network

# 컨테이너 간 통신 테스트
docker-compose exec core-api ping chat-service
```

### 볼륨 확인

```bash
# 데이터베이스 볼륨 확인
docker volume inspect carpoolink-postgres_data

# 또는 직접 데이터 확인
docker-compose exec postgres ls -la /var/lib/postgresql/data
```

## 성능 최적화

### 리소스 제한 설정

docker-compose.yml에서 `resources` 설정:

```yaml
services:
  core-api:
    # ... 기타 설정
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### 자동 정리

```bash
# 정기적으로 미사용 리소스 정리
docker system prune -a --volumes --force
```

## 프로덕션 배포

프로덕션 배포는 GitHub Actions 자동 파이프라인 사용

## 참고 자료

- [Docker Documentation](https://docs.docker.com)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Node.js Documentation](https://nodejs.org/en/docs/)
