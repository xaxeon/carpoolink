# 질문 군집화 테스트 가이드

## 문서 목적

이 문서는 질문 군집화 기능을 로컬에서 실행하고, 결과 파일을 확인하는 절차를 정리합니다.

현재 질문 군집화는 새로 들어온 질문을 기존 cluster 대표 질문과 비교한 뒤, 유사도가 threshold 이상이면 기존 cluster에 편입하고 아니면 새 cluster를 생성하는 방식입니다.

기본 유사도 모드는 `hybrid`입니다. `hybrid`는 규칙 기반 점수와 SBERT embedding cosine similarity를 함께 사용합니다.

## 1. 사전 준비

작업 기준 디렉터리:

- `carpoolink`

Python 실행 경로 예시:

```powershell
..\venv\Scripts\python.exe
```

필요 패키지는 아래 파일 기준입니다.

```text
services/question-service/requirements.txt
```

embedding 기반 검증을 하려면 `sentence-transformers`가 설치되어 있어야 하고, 기본 모델은 `distiluse`입니다.

## 2. API 직접 테스트

question-service 서버를 실행합니다.

```powershell
$env:QUESTION_SERVICE_PYTHON="..\venv\Scripts\python.exe"
$env:QUESTION_SERVICE_PORT="4003"
npm run start -w services/question-service
```

다른 PowerShell 창에서 요청을 보냅니다.

```powershell
$body = @'
{
  "questions": [
    { "question_id": "q1", "text": "이 부분 다시 설명해주실 수 있나요?" },
    { "question_id": "q2", "text": "이 부분을 한 번 더 설명해 주세요" },
    { "question_id": "q3", "text": "과제 제출일이 언제인가요?" }
  ],
  "threshold": 0.72
}
'@

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:4003/api/question-clustering/cluster" `
  -ContentType "application/json; charset=utf-8" `
  -Body $body
```

확인할 값:

- `similarity_mode`: `hybrid`
- `question_count`: `3`
- `cluster_count`: `2`
- `q2`의 `decision`: `append_to_cluster`
- `q3`의 `decision`: `new_cluster`

`similarityMode`를 요청에 넣지 않으면 기본값 `hybrid`가 사용됩니다. 필요하면 `rule`, `hybrid`, `embedding` 중 하나를 직접 지정할 수 있습니다.

## 3. Python 스크립트 직접 테스트

API 서버 없이 Python runner만 직접 실행할 수도 있습니다.

```powershell
$env:HF_HUB_OFFLINE="1"
$env:TRANSFORMERS_OFFLINE="1"

@'
{
  "questions": [
    { "question_id": "q1", "text": "\uc774 \ubd80\ubd84 \ub2e4\uc2dc \uc124\uba85\ud574\uc8fc\uc2e4 \uc218 \uc788\ub098\uc694?" },
    { "question_id": "q2", "text": "\uc774 \ubd80\ubd84\uc744 \ud55c \ubc88 \ub354 \uc124\uba85\ud574 \uc8fc\uc138\uc694" },
    { "question_id": "q3", "text": "\uacfc\uc81c \uc81c\ucd9c\uc77c\uc774 \uc5b8\uc81c\uc778\uac00\uc694?" }
  ],
  "threshold": 0.72
}
'@ | ..\venv\Scripts\python.exe services/question-service/scripts/question-clustering/run_question_clustering_api.py
```

PowerShell 환경에서 한글 stdin이 깨지는 경우가 있어, 위 예시는 unicode escape 형태를 사용합니다.

## 4. Benchmark에 사용한 데이터셋

현재 benchmark는 군집화 전용 정답 데이터셋이 아니라, 질문 판별 데이터셋에서 `label=1`인 질문 문장만 추출해 사용합니다.

입력 파일:

```text
data/processed/question_detection/train.csv
data/processed/question_detection/valid.csv
data/processed/question_detection/test.csv
```

파일 구조:

```text
text,label
```

- `text`: 문장
- `label`: 질문 여부. `1`이면 질문, `0`이면 비질문

전체 질문 수:

- train: 115,007개
- valid: 15,981개
- test: 12,779개
- text 중복 제거 후 전체 질문 후보: 143,173개

주의할 점:

- 이 데이터셋은 질문 군집화 전용 benchmark가 아닙니다.
- 같은 의미 질문 쌍이 충분히 포함되어 있다는 보장이 없습니다.
- 따라서 recall 평가보다는, 엉뚱한 질문을 과하게 묶지 않는지 확인하는 용도에 가깝습니다.

## 5. 200개 샘플 benchmark

기존 processed 질문 데이터셋에서 질문만 모은 뒤, 200개를 샘플링해 pipeline benchmark를 실행한 결과입니다.

실행 명령:

```powershell
$env:HF_HUB_OFFLINE="1"
$env:TRANSFORMERS_OFFLINE="1"

..\venv\Scripts\python.exe services/question-service/scripts/question-clustering/benchmark_question_clustering.py `
  --output-dir services/question-service/outputs/question_clustering/benchmark_existing_processed_sample `
  --python-executable ..\venv\Scripts\python.exe `
  --mode pipeline `
  --similarity-mode hybrid `
  --embedding-model distiluse `
  --sample-size 200 `
  --random-seed 42
```

결과 요약:

- 입력 질문: 200개
- 최종 cluster: 200개
- 기존 cluster 편입: 0개
- multi-question cluster: 0개

결과 위치:

```text
services/question-service/outputs/question_clustering/benchmark_existing_processed_sample/
```

주요 파일:

- `benchmark_run_summary.json`
- `question_only_input.csv`
- `stage1_rule_based/question_cluster_assignments.csv`
- `stage2_embedding/question_cluster_assignments.csv`

해석:

- 랜덤 샘플 200개에서는 서로 묶일 만큼 유사한 질문이 없었습니다.
- threshold `0.72` 기준으로 과도한 병합은 발생하지 않았습니다.

## 6. 전체 데이터셋 precheck

전체 143,173개 질문을 현재 incremental 방식으로 그대로 모두 비교하면 최악의 경우 약 102억 번 비교가 필요합니다.

그래서 전체 pipeline을 무작정 실행하지 않고, 먼저 canonical text 기준으로 중복 후보를 추렸습니다.

결과 요약:

- 중복 제거 후 전체 질문: 143,173개
- distinct canonical text: 143,117개
- canonical duplicate row: 108개
- canonical duplicate group: 52개
- 가장 큰 canonical group size: 3개

결과 위치:

```text
services/question-service/outputs/question_clustering/full_processed_precheck/
```

주요 파일:

- `full_processed_precheck_summary.json`
- `question_only_full_prepared.csv`
- `canonical_duplicate_candidates.csv`

`canonical_duplicate_candidates.csv`는 전체 질문에서 canonical text가 겹친 후보만 모은 파일입니다.

## 7. 중복 후보 108개 pipeline 결과

전체 데이터셋 precheck에서 찾은 canonical duplicate 후보 108개에 대해 실제 pipeline을 적용했습니다.

결과 요약:

- stage1 rule-based
  - 입력 질문: 108개
  - cluster: 50개
  - append: 58개

- stage2 hybrid
  - 입력 질문: 108개
  - 최종 cluster: 40개
  - append: 68개

결과 위치:

```text
services/question-service/outputs/question_clustering/full_processed_precheck/canonical_duplicate_pipeline/
```

주요 파일:

- `stage1_rule_based/question_cluster_assignments.csv`
- `stage2_embedding/question_cluster_assignments.csv`

검토용으로 원본 출처를 붙인 파일:

```text
services/question-service/outputs/question_clustering/full_processed_precheck/canonical_duplicate_final_cluster_review_with_source.csv
```

이 파일은 각 질문이 어느 원본 processed split과 CSV line에서 왔는지 확인할 수 있게 만든 review 파일입니다.

중요 컬럼:

- `final_cluster_id`: 최종 cluster id
- `original_question_id`: benchmark 준비 과정에서 임시로 붙인 질문 id
- `source_path`: 원본 split 파일
- `source_csv_line_1_based`: 헤더를 포함한 CSV line 번호
- `text`: 원문 질문
- `canonical_text`: 정규화된 질문
- `stage1_similarity_score`: rule stage 점수
- `stage2_embedding_score`: embedding score
- `stage2_similarity_score`: 최종 hybrid score

`source_csv_line_1_based`가 1,000,000보다 클 수 있습니다. `train.csv`는 2,178,856행 규모라서 실제로 가능한 line 번호입니다. Excel은 한 시트에서 1,048,576행까지만 보여주므로 큰 line 번호는 Excel에서 직접 확인하기 어렵습니다.

## 8. 현재 한계와 다음 개선 방향

현재 방식은 300개 안팎의 라이브 질문 batch에는 충분히 적용 가능합니다.

예상 비교 수:

```text
300 * 299 / 2 = 44,850
```

다만 대규모 전체 데이터셋을 한 번에 군집화하려면 현재 방식만으로는 비효율적입니다.

개선 방향:

- keyword 또는 canonical token 기반 candidate blocking
- doc_id, topic, keyword 같은 문맥 컬럼이 있는 데이터셋 활용
- embedding vector index 또는 FAISS 도입
- Python subprocess 대신 상시 실행되는 Python worker 또는 FastAPI service로 모델을 한 번만 로드

현재 PR 범위에서는 rule/hybrid incremental clustering, benchmark runner, API endpoint, 기본 hybrid 모드 제공까지를 다룹니다.
