Param(
    [string]$EmbeddingModel = "distiluse",
    [string]$SimilarityMode = "hybrid",
    [string]$Mode = "pipeline",
    [double]$RuleThreshold = 0.72,
    [double]$EmbeddingThreshold = 0.72,
    [Nullable[int]]$SampleSize = $null
)

$ErrorActionPreference = "Stop"
$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..\..\..")).Path
$PythonExe = "C:\Users\admin\Desktop\Capstone_design_2026\Capstone\venv\Scripts\python.exe"

Set-Location $ProjectRoot

$Command = @(
  "services/question-service/scripts/question-clustering/benchmark_question_clustering.py",
  "--output-dir", "services/question-service/outputs/question_clustering/full",
  "--python-executable", $PythonExe,
  "--mode", $Mode,
  "--similarity-mode", $SimilarityMode,
  "--embedding-model", $EmbeddingModel,
  "--rule-threshold", $RuleThreshold,
  "--embedding-threshold", $EmbeddingThreshold,
  "--input-paths",
  "data/processed/question_detection/train.csv",
  "data/processed/question_detection/valid.csv",
  "data/processed/question_detection/test.csv"
)

if ($null -ne $SampleSize) {
  $Command += @("--sample-size", $SampleSize)
}

& $PythonExe $Command
