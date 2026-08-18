$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$BundledPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$PythonCommand = Get-Command python -ErrorAction SilentlyContinue
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue

if (Test-Path $BundledNode) {
  $Node = $BundledNode
} elseif ($NodeCommand) {
  $Node = $NodeCommand.Source
} else {
  throw "Node.js nao encontrado. Instale Node 18+ ou execute dentro do Codex com o runtime empacotado."
}

Set-Location $Root
if (Test-Path $BundledPython) {
  $Python = $BundledPython
} elseif ($PythonCommand) {
  $Python = $PythonCommand.Source
} else {
  throw "Python nao encontrado. Execute setup-translation.ps1 primeiro."
}

$env:PDF_PYTHON = $Python
$ArgosRoot = Join-Path $Root ".argos"
$env:XDG_DATA_HOME = Join-Path $ArgosRoot "data"
$env:XDG_CONFIG_HOME = Join-Path $ArgosRoot "config"
$env:XDG_CACHE_HOME = Join-Path $ArgosRoot "cache"
$env:ARGOS_PACKAGES_DIR = Join-Path $env:XDG_DATA_HOME "argos-translate\packages"
$env:ARGOS_DEVICE_TYPE = "cpu"
if (-not $env:TRANSLATION_API_URL) {
  $env:TRANSLATION_API_URL = "http://127.0.0.1:5000/translate"
}

$PythonScripts = Join-Path (Split-Path $Python -Parent) "Scripts"
$LibreTranslate = Join-Path $PythonScripts "libretranslate.exe"
$ServiceRunning = $false
try {
  $ServiceRunning = Test-NetConnection -ComputerName "127.0.0.1" -Port 5000 -InformationLevel Quiet -WarningAction SilentlyContinue
} catch {
  $ServiceRunning = $false
}

if (-not $ServiceRunning -and (Test-Path $LibreTranslate)) {
  $LogDir = Join-Path $ArgosRoot "logs"
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  Start-Process -FilePath $LibreTranslate `
    -ArgumentList @("--host", "127.0.0.1", "--port", "5000", "--disable-web-ui") `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir "libretranslate.out.log") `
    -RedirectStandardError (Join-Path $LogDir "libretranslate.err.log") | Out-Null
  Write-Host "Iniciando LibreTranslate local em http://127.0.0.1:5000..."
  Start-Sleep -Seconds 3
}

& $Node ".\server.js"
