Param(
    [string]$EmbeddingModel = "distiluse",
    [string]$SimilarityMode = "hybrid",
    [string]$Mode = "pipeline",
    [int]$SampleSize = 200
)

$ErrorActionPreference = "Stop"
$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..\..\..")).Path
$PythonExe = "C:\Users\admin\Desktop\Capstone_design_2026\Capstone\venv\Scripts\python.exe"

Set-Location $ProjectRoot

& $PythonExe "services/question-service/scripts/question-clustering/benchmark_question_clustering.py" `
  --output-dir "services/question-service/outputs/question_clustering/sample" `
  --python-executable $PythonExe `
  --mode $Mode `
  --similarity-mode $SimilarityMode `
  --embedding-model $EmbeddingModel `
  --sample-size $SampleSize `
  --input-paths `
    "data/processed/question_detection/test.csv"
