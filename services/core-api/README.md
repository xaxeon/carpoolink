# core-api

Carpoolink의 메인 API 서버입니다. 사용자 관리, 설문, 멘토 조회, 멘토링 목록, 스크립트 조회를 담당합니다.

## Run

```bash
npm run dev -w services/core-api
```

## Request Headers

- `x-user-id`: 사용자 식별용 헤더입니다. 사용자 단위 조회나 제출 API에서 필요합니다.

## HTTP API

모든 경로 앞에 `/api`를 붙여 사용합니다.

### System

- `GET /health`: 서비스 상태를 확인합니다.

### Surveys

- `GET /surveys`: 사전 설문 질문과 선택지를 조회합니다.
- `POST /surveys/submit`: 사전 설문 결과를 제출하고 멘티 유형을 판정합니다. `x-user-id`가 필요합니다.
    ```
    // 사전 설문 결과 예시
    {
        "answers":
        {
            "goal": "A",
            "style": "B",
            "preference": "A",
            "focus": "B"
        }
    }
    ```

### Users

- `GET /users/exists`: `x-user-id`에 해당하는 사용자 존재 여부를 확인합니다. `x-user-id`가 필요합니다.
- `GET /users/me`: 현재 사용자 프로필을 조회합니다. `x-user-id`가 필요합니다.

### Mentors

- `GET /mentors`: 멘토 목록을 조회합니다.
- `GET /mentors/{mentorId}`: 특정 멘토의 상세 정보를 조회합니다.

### Mentorings

- `GET /mentorings/group`: 일대다 멘토링 목록을 조회합니다. `status`(`READY`/`ON_AIR`/`COMPLETED`) 쿼리로 상태를 필터링할 수 있습니다.
- `GET /mentorings/one-on-one`: 일대일 멘토링 상대 목록을 조회합니다. `x-user-id`가 필요합니다.

### Scripts

- `GET /scripts`: 접근 가능한 스크립트 멘토링 목록을 조회합니다. `x-user-id`와 `type`(`all`/`group`/`one-on-one`) 쿼리를 사용합니다.
- `GET /scripts/{mentoringId}`: 특정 멘토링의 스크립트 전문을 조회합니다. `x-user-id`가 필요합니다.
