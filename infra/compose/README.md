# 로컬 개발 환경 설정

## `docker-compose.yml` 사용 방법

1. DB와 Reverse proxy를 도커 컨테이너를 통해 설정

```
docker-compose --env-file ../../.env up -d
```

2. 필요한 프론트나 백을 터미널에서 실행

## 기타 명령어

- 컨테이너들 상태 확인

  `docker ps`

- 모든 서비스 중지

  `docker-compose down`

- 데이터를 포함하여 완전히 제거
  `docker-compose down -v`


## 서비스 포트 매핑

| 서비스 | 포트 | URL |
|--------|------|-----|
| PostgreSQL | 5432 | `postgresql://localhost:5432/carpoolink` |
| Core API | 4000 | `http://localhost:4000` |
| Chat Service | 4001 | `ws://localhost:4001` |
| Media Server | 4002 | `ws://localhost:4002` |
| Question Service | 4003 | `http://localhost:4003` |
| STT Service | 4004 | `http://localhost:4004` |