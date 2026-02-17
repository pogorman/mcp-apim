# Creates a deployment zip with forward-slash paths (required for Linux function host)
# Usage: powershell -ExecutionPolicy Bypass -File create-zip.ps1 <staging-dir>
Add-Type -Assembly System.IO.Compression.FileSystem
$staging = $args[0]
$zipPath = Join-Path $env:TEMP "func-deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
Get-ChildItem -Path $staging -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($staging.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel) | Out-Null
}
$zip.Dispose()
$size = (Get-Item $zipPath).Length
Write-Output "Zip created: $zipPath ($size bytes)"
