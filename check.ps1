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
& $Node "--check" ".\server.js"
& $Node "--check" ".\public\app.js"
