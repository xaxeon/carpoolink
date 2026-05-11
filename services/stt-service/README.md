# stt-service

음성 데이터를 텍스트로 변환(STT)하고 스크립트 청크를 DB에 저장하는 서비스입니다.
OpenAI Whisper API(`gpt-4o-transcribe`)를 사용합니다.

## Run

```bash
npm run dev -w services/stt-service
```

## Environment Variables

'services/stt-services/.env'에 아래 값을 설정해야 합니다.

```env
OPENAI_API_KEY=your_openai_api_key
```

## Test

서버 실행 후 아래 명령어로 테스트할 수 있습니다.

```bash
curl.exe -X POST http://localhost:4004/stt/chunk \
  -F "audio=@./services/stt-service/src/(파일이름).wav" \
  -F "userId=1" \
  -F "mentoringId=1" \
  -F "chunkIndex=0"
```

## HTTP API

모든 경로 앞에 `/stt`를 붙여 사용합니다.