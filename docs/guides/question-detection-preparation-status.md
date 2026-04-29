# 질문 탐지 준비 현황

## 문서 목적

이 문서는 질문 탐지 기능을 본격적으로 학습하고 서비스에 연결하기 전에, 현재까지 준비된 데이터셋과 전처리 작업을 팀 전체가 한눈에 이해할 수 있도록 정리한 문서입니다.

이 문서를 읽으면 다음 내용을 빠르게 파악할 수 있습니다.

- 질문 탐지 준비 단계에서 무엇을 만들었는지
- 현재 어떤 데이터와 스크립트가 준비되어 있는지
- 각 스크립트가 어떤 역할을 하는지
- Issue #2 범위에서 어디까지 완료되었는지
- 다음 단계에서 이어서 해야 할 일이 무엇인지

관련 이슈:

- GitHub Issue #2: 질문 탐지 모듈 사전 준비 - 데이터셋 구축 및 규칙 기반 전처리 설계

## 이번 단계의 범위

이번 준비 단계는 크게 두 부분으로 나뉩니다.

1. 질문 / 비질문 분류를 위한 데이터셋을 만들고 정리한다.
2. 실시간 채팅 입력을 다루기 위한 규칙 기반 전처리와 질문 후보 선별 규칙을 정의한다.

반대로 아래 항목은 이번 단계의 범위에 포함되지 않습니다.

- KcELECTRA 기반 최종 분류기 학습 완료
- TF-IDF + KcELECTRA 하이브리드 추론 파이프라인 완성
- 실시간 서비스용 API 연결

즉, 이번 단계는 “학습과 서비스 연결을 위한 준비를 마치는 단계”로 이해하면 됩니다.

## 전체 진행 상태

현재 상태는 Issue #2 기준으로 보면 대부분 완료입니다.

완료된 항목:

- 질문 탐지용 데이터셋 구성 흐름이 마련됨
- train / valid / test 분할 완료
- TF-IDF 입력용 정규화 데이터 별도 생성 가능
- 질문 / 비질문 판별을 위한 규칙 기반 패턴 정의 완료
- 규칙 적용 여부를 비교하는 실험 스크립트와 오류 분석 스크립트 확보

부분적으로만 정리된 항목:

- `label=1`은 질문, `label=0`은 비질문이라는 기준은 코드와 데이터에 반영되어 있지만, 사람이 읽는 별도 라벨링 가이드 문서는 아직 없음
- 채팅 축약어와 구어체는 규칙 패턴으로 일부 반영되어 있지만, 사전형 정규화까지는 아직 아님

## 작업 흐름별 정리

### 1. 원본 데이터 정리 및 질문 탐지용 데이터셋 구성

질문 탐지 데이터셋은 여러 전처리 스크립트를 거쳐 만들어집니다.

관련 파일:

- `services/question-service/scripts/question-detection/preprocess_aihub_sns_multiturn.py`
- `services/question-service/scripts/question-detection/clean_aihub_sns_multiturn.py`
- `services/question-service/scripts/question-detection/build_question_detection_dataset.py`

이 스크립트들이 하는 일:

- AI Hub SNS 멀티턴 데이터를 모델이 다룰 수 있는 형태로 펼친다
- 학습에 불필요한 노이즈를 제거한다
- 질문 탐지용 데이터셋 형태로 묶는다

이 단계가 중요한 이유:

- 질문 탐지는 일반 문어체보다 실제 채팅체 예시가 훨씬 중요하다
- 따라서 원본 대화 데이터를 질문 탐지 기준에 맞게 정리하는 작업이 먼저 필요하다

### 2. 학습 / 검증 / 테스트 데이터 분리

가공된 데이터는 train, valid, test로 나뉘어 관리됩니다.

관련 파일:

- `services/question-service/scripts/question-detection/split_question_detection_dataset.py`
- `data/processed/question_detection/train.csv.dvc`
- `data/processed/question_detection/valid.csv.dvc`
- `data/processed/question_detection/test.csv.dvc`

이 단계에서 확보되는 것:

- 재현 가능한 데이터 분할 방식
- DVC를 통한 분할 결과 버전 관리
- 이후 모델 비교를 위한 고정 평가 기준

### 3. TF-IDF용 입력 정규화

실시간 채팅 입력은 URL, 이메일, 반복 문자, 과한 문장 부호, 들쑥날쑥한 공백처럼 노이즈가 많습니다.
그래서 TF-IDF 같은 1차 경량 모델에 넣기 전에 입력을 정규화하는 과정이 필요합니다.

관련 파일:

- `services/question-service/scripts/question-detection/preprocess_question_detection_for_tfidf.py`

현재 처리되는 항목:

- 영문/숫자 혼합 입력에 대한 소문자 정규화
- URL 치환
- 이메일 치환
- 반복 문장 부호 축약
- 반복 채팅 문자 축약
- 일부 특수문자 정리
- 공백 정리

생성 결과:

- `data/processed/question_detection/tfidf_ready.dvc`

이 단계가 중요한 이유:

- TF-IDF 성능은 입력 텍스트가 얼마나 일관되게 정리되었는지에 크게 영향을 받는다
- 따라서 이 정규화 스크립트는 질문 탐지 1차 분류 성능의 기반이 된다

### 4. 규칙 기반 질문 후보 선별 로직

채팅에는 모델 없이도 비교적 쉽게 잡아낼 수 있는 질문 신호와 비질문 반응 신호가 있습니다.
이를 반영하기 위해 규칙 기반 패턴 레이어를 따로 구성했습니다.

관련 파일:

- `services/question-service/scripts/question-detection/question_detection_rules.py`

현재 정의된 항목:

- 질문 어휘 패턴
- 질문 종결형 패턴
- 요청형 표현 패턴
- 채팅체 질문 패턴
- 반응문 패턴
- 비질문 시작 패턴
- 비질문 종결 패턴

이 규칙 레이어의 역할:

- 명확한 질문 신호를 빠르게 포착한다
- 반응문이나 단순 진술문을 빠르게 구분한다
- 이후 오류 분석 시 해석 가능한 기준을 제공한다

이 단계가 중요한 이유:

- 채팅 데이터는 짧고 비정형적이라, 일부 패턴은 모델보다 규칙이 더 빠르고 설명 가능하게 처리할 수 있다
- 규칙 기반 전처리는 이후 하이브리드 구조를 설계할 때 중요한 출발점이 된다

### 5. 규칙 기반 전처리의 효과 검증

준비 단계에서는 단순히 규칙을 만드는 것에서 끝나지 않고, 규칙을 실제로 적용했을 때 baseline 성능에 도움이 되는지도 확인할 수 있도록 구성했습니다.

관련 파일:

- `services/question-service/scripts/question-detection/train_tfidf_question_detector.py`
- `services/question-service/scripts/question-detection/train_tfidf_question_detector_with_threshold.py`
- `services/question-service/scripts/question-detection/compare_question_detector_variants.py`
- `services/question-service/scripts/question-detection/analyze_question_detection_errors.py`

이 스크립트들이 지원하는 작업:

- TF-IDF baseline 학습
- validation 기준 threshold 탐색
- 규칙 적용 / 미적용 버전 비교
- false positive / false negative 패턴 분석

관련 산출물:

- `services/question-service/outputs/question_detection/tfidf_lr.dvc`
- `services/question-service/outputs/question_detection/tfidf_lr_threshold.dvc`
- `services/question-service/outputs/question_detection/variant_comparison/comparison_report.md`

이 단계가 중요한 이유:

- 준비 단계는 단순히 스크립트를 모아두는 작업이 아니라
- 실제로 이 규칙과 전처리 방식이 다음 단계로 넘어갈 가치가 있는지 검증하는 단계이기도 하다

## Issue #2 기준으로 완료된 것으로 볼 수 있는 항목

팀 관점에서 아래 항목은 준비 단계에서 완료된 것으로 봐도 됩니다.

- 데이터셋 생성 흐름이 재현 가능하게 정리되어 있음
- 질문 / 비질문 라벨 데이터가 train / valid / test 형태로 준비되어 있음
- 채팅 입력 정규화 규칙이 존재함
- 질문 후보 선별용 규칙 기반 로직이 존재함
- 규칙 적용 효과를 비교하고 오류를 분석할 수 있는 실험 스크립트가 존재함

즉, 팀은 이제 “데이터와 규칙을 준비하는 단계”를 넘어, “더 강한 모델을 학습하고 실제 추론 파이프라인으로 연결하는 단계”로 넘어갈 수 있는 상태입니다.

## 현재 한계와 주의할 점

현재 산출물을 볼 때 아래 사항은 같이 알고 있어야 합니다.

- 라벨링 기준은 코드와 데이터에는 반영되어 있지만, 별도 문서형 가이드는 아직 부족함
- 일부 오래된 스크립트 주석이나 출력에는 인코딩 문제가 남아 있을 수 있음
- 채팅 축약어 처리는 패턴 기반이라서, 더 넓은 표현을 다루려면 후속 보강이 필요함
- 현재 준비 단계 스크립트는 실험과 검증용으로는 충분하지만, 곧바로 운영용 추론 파이프라인과 동일하다고 보기는 어려움

## 다음 단계 권장 방향

다음 단계는 아래 순서로 이어가는 것이 자연스럽습니다.

1. KcELECTRA 기반 질문 분류기를 학습하고 저장한다.
2. 규칙 또는 TF-IDF를 1차 경량 필터로 사용한다.
3. 애매한 샘플만 더 무거운 모델로 보낸다.
4. 최종 파이프라인을 서비스 인터페이스에 연결한다.

이 방식은 실시간 채팅 환경에서 속도와 정확도 사이의 균형을 맞추는 데 유리합니다.

## 빠르게 참고할 파일 목록

처음 보는 팀원이 전체 흐름을 빠르게 따라가려면 아래 순서로 보면 됩니다.

- 원본 데이터 정리:
  `services/question-service/scripts/question-detection/preprocess_aihub_sns_multiturn.py`
  `services/question-service/scripts/question-detection/clean_aihub_sns_multiturn.py`
  `services/question-service/scripts/question-detection/build_question_detection_dataset.py`
- 데이터 분할:
  `services/question-service/scripts/question-detection/split_question_detection_dataset.py`
- TF-IDF 입력 정규화:
  `services/question-service/scripts/question-detection/preprocess_question_detection_for_tfidf.py`
- 규칙 정의:
  `services/question-service/scripts/question-detection/question_detection_rules.py`
- baseline 학습 및 threshold 실험:
  `services/question-service/scripts/question-detection/train_tfidf_question_detector.py`
  `services/question-service/scripts/question-detection/train_tfidf_question_detector_with_threshold.py`
- 비교 및 오류 분석:
  `services/question-service/scripts/question-detection/compare_question_detector_variants.py`
  `services/question-service/scripts/question-detection/analyze_question_detection_errors.py`

