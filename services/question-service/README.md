# question-service

질문 추천, 추출, 정렬 등 질문과 관련된 기능을 지원하는 서비스입니다.

## Run

```bash
npm run dev -w services/question-service
```

## API

`POST /api/question-detection/predict`

Request body:

```json
{
  "text": "혹시 몇 시에 출발해?"
}
```

Key environment variables:

- `QUESTION_SERVICE_PYTHON`: Python executable path for inference
- `QUESTION_DETECTION_SCRIPT_PATH`: override hybrid inference script path
- `QUESTION_TFIDF_ARTIFACT_DIR`: TF-IDF artifact directory
- `QUESTION_KC_ELECTRA_DIR`: KC-ELECTRA artifact directory
- `QUESTION_DETECTION_TIMEOUT_MS`: inference subprocess timeout
- `QUESTION_ALWAYS_USE_KC_ELECTRA_ON_RULE_QUESTION`: `true` to force KC-ELECTRA confirmation for strong rule-question cases
