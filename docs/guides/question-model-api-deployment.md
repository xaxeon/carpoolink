# Question Model API Deployment

This guide explains how to run and deploy the Python model API used by
`question-service`.

## Local Development

Start the FastAPI model API:

```powershell
npm.cmd run dev:question:model
```

In another terminal, route the Node question-service through the model API:

```powershell
$env:QUESTION_MODEL_API_URL="http://127.0.0.1:8000"
npm.cmd run dev:question
```

Test question detection through the Node service:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:4003/api/question-detection/predict" `
  -Method Post `
  -ContentType "application/json; charset=utf-8" `
  -Body '{"text":"이 부분 다시 설명해주실 수 있나요?"}'
```

Test question clustering through the Node service:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:4003/api/question-clustering/cluster" `
  -Method Post `
  -ContentType "application/json; charset=utf-8" `
  -Body '{"questions":[{"id":"q1","text":"이 부분 다시 설명해주실 수 있나요?"},{"id":"q2","text":"이 부분을 다시 설명해 주세요"}],"similarityMode":"rule","threshold":0.5}'
```

## Docker Compose

The compose stack includes:

- `question-model-api`: FastAPI service on port `8000`.
- `question-service`: Node service on port `4003`, configured with
  `QUESTION_MODEL_API_URL=http://question-model-api:8000`.

Run only the question services:

```powershell
docker compose -f infra/compose/docker-compose.yml up -d --build question-model-api question-service
```

If local ports `4003` or `8000` are already in use, override the host ports:

```powershell
$env:QUESTION_SERVICE_HOST_PORT="4015"
$env:QUESTION_MODEL_API_HOST_PORT="8015"
docker compose -f infra/compose/docker-compose.yml up -d --build question-model-api question-service
```

Check health:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -Method Get
Invoke-RestMethod -Uri "http://127.0.0.1:4003/health" -Method Get
```

When using override ports, replace `8000` and `4003` with the configured host
ports.

## Deployment Notes

- Keep `question-model-api` and `question-service` as separate services.
- On EC2, model artifacts must exist at `/app/services/model/question_detection`
  before deploying `question-model-api`.
- Do not ship `services/model/question_detection.zip` in the Docker build
  context; it is excluded by `.dockerignore`.
- Production deployment sets `QUESTION_PRELOAD_KC_ELECTRA=true` so the neural
  model loads during container startup. This avoids first-request latency and
  fails fast if the model artifacts are missing.
- For production, expose `question-service` publicly and keep
  `question-model-api` private on the internal service network.

## GitHub Actions Deployment

The existing workflow deploys through AWS SSM to the running EC2 instance tagged:

```text
Name = carpoolink-server
```

For the first model API rollout, run the workflow manually:

1. Open GitHub Actions.
2. Select `Deploy Carpoolink Services`.
3. Click `Run workflow`.
4. Use the `main` branch.

The workflow builds and pushes `question-model-api` to GHCR, then deploys it on
the same Docker network as `question-service`. The Node service receives:

```text
QUESTION_MODEL_API_URL=http://carpoolink-question-model-api:8000
```

If the workflow fails with a missing model artifact message, restore or upload
the DVC model directory to the EC2 path:

```text
/app/services/model/question_detection
```

The model directory is tracked by DVC. On the EC2 host, restore it from the
project root with:

```bash
pip install "dvc[s3]"
dvc pull services/model/question_detection.dvc
```

The configured DVC remote is:

```text
s3://capstone2026-carpoolink-dvc-kro
```
