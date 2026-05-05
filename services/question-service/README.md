# question-service

Question detection and question clustering service for live mentoring sessions.

## Run

```bash
npm run dev -w services/question-service
```

For local Python scripts, set `QUESTION_SERVICE_PYTHON` to an environment that has
`services/question-service/requirements.txt` installed.

```powershell
$env:QUESTION_SERVICE_PYTHON="..\venv\Scripts\python.exe"
npm run dev -w services/question-service
```

## API

### `POST /api/question-detection/predict`

Request body:

```json
{
  "text": "혹시 몇 시에 출발해?"
}
```

### `POST /api/question-clustering/cluster`

Request body:

```json
{
  "questions": [
    { "question_id": "q1", "text": "이 부분 다시 설명해주실 수 있나요?" },
    { "question_id": "q2", "text": "이 부분을 한 번 더 설명해 주세요" },
    { "question_id": "q3", "text": "과제 제출일이 언제인가요?" }
  ],
  "threshold": 0.72,
  "similarityMode": "hybrid"
}
```

Response fields include `cluster_count`, `clusters`, and per-question
`assignments` with `rule_score`, optional `embedding_score`, and final
`similarity_score`.

## Environment Variables

- `QUESTION_SERVICE_PORT`: HTTP port. Defaults to `4003`.
- `QUESTION_SERVICE_PYTHON`: Python executable path for inference and clustering.
- `QUESTION_DETECTION_SCRIPT_PATH`: override hybrid detection script path.
- `QUESTION_TFIDF_ARTIFACT_DIR`: TF-IDF artifact directory.
- `QUESTION_KC_ELECTRA_DIR`: KC-ELECTRA artifact directory.
- `QUESTION_DETECTION_TIMEOUT_MS`: inference subprocess timeout.
- `QUESTION_ALWAYS_USE_KC_ELECTRA_ON_RULE_QUESTION`: `true` to force KC-ELECTRA confirmation for strong rule-question cases.
- `QUESTION_CLUSTERING_SCRIPT_PATH`: override clustering API script path.
- `QUESTION_CLUSTERING_THRESHOLD`: default clustering threshold.
- `QUESTION_CLUSTERING_SIMILARITY_MODE`: `rule`, `hybrid`, or `embedding`. Defaults to `hybrid`.
- `QUESTION_CLUSTERING_EMBEDDING_MODEL`: embedding model alias or Hugging Face model id.
- `QUESTION_CLUSTERING_TIMEOUT_MS`: clustering subprocess timeout.
