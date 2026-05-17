from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


APP_DIR = Path(__file__).resolve().parent
SERVICE_ROOT = APP_DIR.parent
REPO_ROOT = SERVICE_ROOT.parent.parent
QUESTION_DETECTION_SCRIPT_DIR = SERVICE_ROOT / "scripts" / "question-detection"
QUESTION_CLUSTERING_SCRIPT_DIR = SERVICE_ROOT / "scripts" / "question-clustering"

sys.path.insert(0, str(QUESTION_DETECTION_SCRIPT_DIR))
sys.path.insert(0, str(QUESTION_CLUSTERING_SCRIPT_DIR))

from question_detection_inference import (  # noqa: E402
    HybridQuestionDetector,
    HybridQuestionDetectorConfig,
)
from question_clustering_inference import (  # noqa: E402
    QuestionClusterer,
    QuestionClusteringConfig,
)


DEFAULT_TFIDF_ARTIFACT_DIR = REPO_ROOT / "services" / "model" / "question_detection" / "tfidf_lr_rule_filter_off"
DEFAULT_KC_ELECTRA_DIR = REPO_ROOT / "services" / "model" / "question_detection" / "kc_electra_question_detector"


class QuestionDetectionRequest(BaseModel):
    text: str = Field(..., description="Chat text to classify as a question or non-question.")


class QuestionClusteringRequest(BaseModel):
    questions: list[Any]
    threshold: float | None = None
    similarityMode: str | None = None
    similarity_mode: str | None = None
    embeddingModel: str | None = None
    embedding_model: str | None = None


class HealthResponse(BaseModel):
    service: str
    status: str
    detector_loaded: bool
    clusterer_loaded: bool


detector: HybridQuestionDetector | None = None
clusterer: QuestionClusterer | None = None


def env_bool(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.lower() in {"1", "true", "yes", "y", "on"}


def env_float(name: str, default: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        return float(raw_value)
    except ValueError:
        return default


def build_detector_config() -> HybridQuestionDetectorConfig:
    tfidf_artifact_dir = Path(os.getenv("QUESTION_TFIDF_ARTIFACT_DIR", str(DEFAULT_TFIDF_ARTIFACT_DIR)))
    kc_electra_dir = Path(os.getenv("QUESTION_KC_ELECTRA_DIR", str(DEFAULT_KC_ELECTRA_DIR)))

    return HybridQuestionDetectorConfig(
        tfidf_artifact_dir=tfidf_artifact_dir,
        kc_electra_dir=kc_electra_dir,
        tfidf_low_confidence=env_float("QUESTION_TFIDF_LOW_CONFIDENCE", 0.15),
        tfidf_high_confidence=env_float("QUESTION_TFIDF_HIGH_CONFIDENCE", 0.85),
        tfidf_margin=env_float("QUESTION_TFIDF_MARGIN", 0.10),
        always_use_kc_electra_on_rule_question=env_bool(
            "QUESTION_ALWAYS_USE_KC_ELECTRA_ON_RULE_QUESTION",
            False,
        ),
    )


def build_clustering_config() -> QuestionClusteringConfig:
    return QuestionClusteringConfig(
        threshold=env_float("QUESTION_CLUSTERING_THRESHOLD", 0.72),
        similarity_mode=os.getenv("QUESTION_CLUSTERING_SIMILARITY_MODE", "hybrid"),
        embedding_model=os.getenv("QUESTION_CLUSTERING_EMBEDDING_MODEL", "distiluse"),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector, clusterer
    config = build_detector_config()
    detector = HybridQuestionDetector(
        config,
        preload_kc_electra=env_bool("QUESTION_PRELOAD_KC_ELECTRA", False),
    )
    clusterer = QuestionClusterer()
    yield
    detector = None
    clusterer = None


app = FastAPI(
    title="Carpoolink Question Model API",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        service="question-model-api",
        status="ok",
        detector_loaded=detector is not None,
        clusterer_loaded=clusterer is not None,
    )


@app.post("/question-detection/predict")
def predict_question(request: QuestionDetectionRequest) -> dict[str, Any]:
    if detector is None:
        raise HTTPException(status_code=503, detail="Question detector is not loaded.")

    return detector.predict(request.text)


@app.post("/question-clustering/cluster")
def cluster_questions(request: QuestionClusteringRequest) -> dict[str, Any]:
    if clusterer is None:
        raise HTTPException(status_code=503, detail="Question clusterer is not loaded.")

    payload = request.model_dump(exclude_none=True)
    if request.similarityMode is not None:
        payload["similarity_mode"] = request.similarityMode
    if request.embeddingModel is not None:
        payload["embedding_model"] = request.embeddingModel

    try:
        return clusterer.cluster(payload, build_clustering_config())
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
