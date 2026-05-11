Param(
    [string]$EmbeddingModel = "distiluse",
    [string]$SimilarityMode = "hybrid",
    [string]$Mode = "pipeline",
    [string]$Thresholds = "0.72,0.68,0.64,0.60",
    [Nullable[int]]$SampleSize = $null
)

$ErrorActionPreference = "Stop"
$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..\..\..")).Path
$PythonExe = "C:\Users\admin\Desktop\Capstone_design_2026\Capstone\venv\Scripts\python.exe"

Set-Location $ProjectRoot

$ThresholdList = $Thresholds.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }

$Command = @(
  "services/question-service/scripts/question-clustering/tune_question_clustering_thresholds.py",
  "--output-root", "services/question-service/outputs/question_clustering/full_threshold_sweep",
  "--python-executable", $PythonExe,
  "--mode", $Mode,
  "--similarity-mode", $SimilarityMode,
  "--embedding-model", $EmbeddingModel,
  "--input-paths",
  "data/processed/question_detection/train.csv",
  "data/processed/question_detection/valid.csv",
  "data/processed/question_detection/test.csv",
  "--thresholds"
)

$Command += $ThresholdList

if ($null -ne $SampleSize) {
  $Command += @("--sample-size", $SampleSize)
}

& $PythonExe $Command
