Param(
    [string]$ModelName = "beomi/KcELECTRA-base-v2022",
    [string]$OutputDir = "carpoolink/services/model/question_detection/kc_electra_question_detector"
)

$ErrorActionPreference = "Stop"

# 현재 ps1 파일 위치 기준
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# scripts 폴더 기준으로 4단계 위로 올라가면 Capstone\carpoolink
$CarpoolinkRoot = (Resolve-Path (Join-Path $ScriptDir "..\..\..")).Path
$ProjectRoot = (Resolve-Path (Join-Path $CarpoolinkRoot "..")).Path

# 현재 활성화된 venv python 우선 사용
$PythonExe = (Get-Command python).Source

Write-Host "[INFO] ScriptDir      : $ScriptDir"
Write-Host "[INFO] CarpoolinkRoot : $CarpoolinkRoot"
Write-Host "[INFO] ProjectRoot    : $ProjectRoot"
Write-Host "[INFO] PythonExe      : $PythonExe"

Set-Location $ProjectRoot

& $PythonExe "carpoolink/services/question-service/scripts/train_kc_electra_question_detector.py" `
  --train-path "carpoolink/data/processed/question_detection/train.csv" `
  --valid-path "carpoolink/data/processed/question_detection/valid.csv" `
  --test-path "carpoolink/data/processed/question_detection/test.csv" `
  --model-name $ModelName `
  --output-dir $OutputDir `
  --num-train-epochs 3 `
  --learning-rate 2e-5 `
  --train-batch-size 16 `
  --eval-batch-size 32 `
  --max-length 96 `
  --weight-decay 0.01 `
  --warmup-ratio 0.1 `
  --gradient-accumulation-steps 2 `
  --logging-steps 100 `
  --save-total-limit 2 `
  --gradient-checkpointing