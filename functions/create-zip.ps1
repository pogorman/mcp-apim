Add-Type -Assembly System.IO.Compression.FileSystem

$zipPath = Join-Path $PSScriptRoot "deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')

function Add-DirectoryToZip($basePath, $entryBase) {
    Get-ChildItem -Path $basePath -Recurse -File | ForEach-Object {
        $relPath = $_.FullName.Substring((Resolve-Path $basePath).Path.Length + 1).Replace('\', '/')
        $entryPath = "$entryBase/$relPath"
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryPath, 'Optimal') | Out-Null
    }
}

Add-DirectoryToZip (Join-Path $PSScriptRoot "dist") "dist"
Add-DirectoryToZip (Join-Path $PSScriptRoot "node_modules") "node_modules"

[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $PSScriptRoot "host.json"), "host.json", 'Optimal') | Out-Null
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $PSScriptRoot "package.json"), "package.json", 'Optimal') | Out-Null

$zip.Dispose()
Write-Host "Created $zipPath"
