Add-Type -AssemblyName System.Windows.Forms
$ErrorActionPreference = 'Stop'
function Select-LocalFile([string]$title, [string]$filter) {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    try {
        $dialog.Title = $title
        $dialog.Filter = $filter
        $dialog.CheckFileExists = $true
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.FileName }
    } finally { $dialog.Dispose() }
}

$remembered = Join-Path $PSScriptRoot 'engine-path.txt'
$selectedPath = if (Test-Path -LiteralPath $remembered) { Get-Content -LiteralPath $remembered -Encoding UTF8 -TotalCount 1 }
$enginePath = @($env:ISILOXC_PATH, $selectedPath, (Join-Path $PSScriptRoot 'iSiloXC.exe')) |
    Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (!$enginePath) { $enginePath = Select-LocalFile '選擇 PDB 轉檔執行檔' 'PDB 轉檔引擎|*.exe' }
if (!$enginePath) { return }
$projectPath = Select-LocalFile '選擇要執行的批次製書專案' 'PDB 專案|*.ixl'
if (!$projectPath) { return }
$answer = [System.Windows.Forms.MessageBox]::Show('要另外載入 .ixs 環境設定嗎？','轉檔環境','YesNoCancel')
if ($answer -eq 'Cancel') { return }
$engineArgs = @('-x', $projectPath, '-v')
if ($answer -eq 'Yes') {
    $settingsPath = Select-LocalFile '選擇轉檔設定' 'PDB 設定|*.ixs'
    if (!$settingsPath) { return }
    $engineArgs += @('-o', $settingsPath)
}
$confirm = [System.Windows.Forms.MessageBox]::Show("即將執行此專案中的轉檔工作，並寫入其指定的目的地。既有檔案可能被覆寫。請確認來源及目的地。\n\n$projectPath".Replace('\n',[Environment]::NewLine),'執行批次轉檔','OKCancel')
if ($confirm -ne 'OK') { return }
Push-Location -LiteralPath (Split-Path -LiteralPath $projectPath)
try {
    & $enginePath @engineArgs
    if ($LASTEXITCODE -ne 0) { throw "PDB 轉檔引擎 結束代碼 $LASTEXITCODE" }
} finally { Pop-Location }
