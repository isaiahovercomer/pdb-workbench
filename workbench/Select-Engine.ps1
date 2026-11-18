# Runs inside the process that hosts the workbench.
$savedPath = Join-Path $PSScriptRoot 'engine-path.txt'
if (!$env:ISILOXC_PATH -and (Test-Path -LiteralPath $savedPath)) {
    $candidate = (Get-Content -LiteralPath $savedPath -Encoding UTF8 -TotalCount 1)
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { $env:ISILOXC_PATH = $candidate }
}
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'iSiloXC.exe')) -and !$env:ISILOXC_PATH) {
    Add-Type -AssemblyName System.Windows.Forms
    $picker = New-Object Windows.Forms.OpenFileDialog
    try {
        $picker.Title = '選擇轉檔引擎或原廠 ZIP（取消可先進入工作台）'
        $picker.Filter = 'PDB 轉檔引擎或封裝|*.exe;*.zip'
        $picker.InitialDirectory = [Environment]::GetFolderPath('DesktopDirectory')
        if ($picker.ShowDialog() -eq 'OK') {
            $candidate = $picker.FileName
            if ([IO.Path]::GetExtension($candidate) -ieq '.zip') {
                Add-Type -AssemblyName System.IO.Compression.FileSystem
                $zip = [IO.Compression.ZipFile]::OpenRead($candidate)
                try {
                    $entry = @($zip.Entries | Where-Object { $_.Name -ieq 'iSiloXC.exe' })
                    if ($entry.Count -ne 1 -or $entry[0].Length -gt 64MB) { throw '壓縮檔內需有一個相容的轉檔引擎。' }
                    $programDir = Join-Path $PSScriptRoot ('engine-' + [Guid]::NewGuid().ToString('N'))
                    [IO.Directory]::CreateDirectory($programDir) | Out-Null
                    foreach ($item in $zip.Entries) {
                        if ($item.Name -in @('iSiloXC.exe','readme.txt','license.txt') -and $item.Length -le 64MB) {
                            [IO.Compression.ZipFileExtensions]::ExtractToFile($item,(Join-Path $programDir $item.Name))
                        }
                    }
                    $candidate = Join-Path $programDir 'iSiloXC.exe'
                } finally { $zip.Dispose() }
            }
            if ([IO.Path]::GetFileName($candidate) -ine 'iSiloXC.exe') { throw '請選擇相容的 PDB 轉檔引擎。' }
            $env:ISILOXC_PATH = $candidate
            [IO.File]::WriteAllText($savedPath,$candidate,[Text.Encoding]::UTF8)
        }
    } catch {
        [Windows.Forms.MessageBox]::Show($_.Exception.Message,'引擎設定') | Out-Null
    } finally { $picker.Dispose() }
}
