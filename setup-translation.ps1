$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BundledPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$PythonCommand = Get-Command python -ErrorAction SilentlyContinue

if (Test-Path $BundledPython) {
  $Python = $BundledPython
} elseif ($PythonCommand) {
  $Python = $PythonCommand.Source
} else {
  throw "Python nao encontrado. Instale Python 3.10+ antes de continuar."
}

$ArgosRoot = Join-Path $Root ".argos"
$env:XDG_DATA_HOME = Join-Path $ArgosRoot "data"
$env:XDG_CONFIG_HOME = Join-Path $ArgosRoot "config"
$env:XDG_CACHE_HOME = Join-Path $ArgosRoot "cache"
$env:ARGOS_PACKAGES_DIR = Join-Path $env:XDG_DATA_HOME "argos-translate\packages"
$env:ARGOS_DEVICE_TYPE = "cpu"

New-Item -ItemType Directory -Force -Path $env:XDG_DATA_HOME, $env:XDG_CONFIG_HOME, $env:XDG_CACHE_HOME, $env:ARGOS_PACKAGES_DIR | Out-Null

Write-Host "Instalando dependencias Python..."
& $Python -m pip install pdfplumber pypdf reportlab libretranslate

$PythonScripts = Join-Path (Split-Path $Python -Parent) "Scripts"
$ArgosPsm = Join-Path $PythonScripts "argospm.exe"
if (-not (Test-Path $ArgosPsm)) {
  throw "argospm nao foi instalado corretamente."
}

Write-Host "Atualizando indice de modelos Argos Translate..."
& $ArgosPsm update

$Models = @(
  "translate-pt_en", "translate-en_pt",
  "translate-en_es", "translate-es_en",
  "translate-en_fr", "translate-fr_en",
  "translate-en_de", "translate-de_en",
  "translate-en_it", "translate-it_en",
  "translate-en_ja", "translate-ja_en",
  "translate-en_zh", "translate-zh_en",
  "translate-en_ru", "translate-ru_en"
)

foreach ($Model in $Models) {
  Write-Host "Instalando modelo $Model..."
  & $ArgosPsm install $Model
}

Write-Host "Preparando segmentadores de frases locais..."
$SbdScript = @'
import argostranslate.sbd
from argostranslate import settings
from minisbd import models
models.cache_dir = str(settings.data_dir / "minisbd")
for language in ["pt", "en", "es", "fr", "de", "it", "ja", "zh-hans", "ru"]:
    models.get_model_file(language)
'@
$SbdScript | & $Python -

Write-Host "Configuracao concluida. Os modelos ficam em $env:ARGOS_PACKAGES_DIR"
