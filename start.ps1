$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue

if (Test-Path $BundledNode) {
  $Node = $BundledNode
} elseif ($NodeCommand) {
  $Node = $NodeCommand.Source
} else {
  throw "Node.js nao encontrado. Instale Node 18+ ou execute dentro do Codex com o runtime empacotado."
}

Set-Location $Root

# Se os modelos Argos/LibreTranslate já foram preparados, prefira a tradução
# local para evitar cotas de provedores públicos. O backend web continua sendo
# configurável por TRANSLATION_API_URL.
if (-not $env:TRANSLATION_API_URL) {
  $BundledPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
  $ArgosRoot = Join-Path $Root ".argos"
  $env:XDG_DATA_HOME = Join-Path $ArgosRoot "data"
  $env:XDG_CONFIG_HOME = Join-Path $ArgosRoot "config"
  $env:XDG_CACHE_HOME = Join-Path $ArgosRoot "cache"
  $env:ARGOS_PACKAGES_DIR = Join-Path $env:XDG_DATA_HOME "argos-translate\packages"
  $env:ARGOS_DEVICE_TYPE = "cpu"
  $TranslationPython = $null
  if (Test-Path $BundledPython) {
    $TranslationPython = $BundledPython
  } else {
    $PythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($PythonCommand) { $TranslationPython = $PythonCommand.Source }
  }
  $PythonScripts = if ($TranslationPython) { Join-Path (Split-Path $TranslationPython -Parent) "Scripts" } else { "" }
  $LibreTranslate = if ($PythonScripts) { Join-Path $PythonScripts "libretranslate.exe" } else { "" }

  if (Test-Path $LibreTranslate) {
    $ServiceRunning = $false
    try {
      $ServiceRunning = [bool](Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction Stop)
    } catch {
      $ServiceRunning = $false
    }

    if (-not $ServiceRunning) {
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
    $env:TRANSLATION_API_URL = "http://127.0.0.1:5000/translate"
  }
}

& $Node ".\server.js"
