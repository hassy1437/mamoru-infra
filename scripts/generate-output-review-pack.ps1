param(
    [string]$OutDir = "",
    [double]$RenderScale = 2.0
)

function New-ReviewTimestamp {
    $now = Get-Date
    return "{0}{1}{2}-{3}{4}{5}" -f $now.Year, $now.ToString("MM"), $now.ToString("dd"), $now.ToString("HH"), $now.ToString("mm"), $now.ToString("ss")
}

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path (Join-Path (Join-Path $PWD "tmp") "output-review") (New-ReviewTimestamp)
} else {
    $OutDir = [System.IO.Path]::GetFullPath($OutDir)
}

Write-Host "Generating review pack to $OutDir"

& node "scripts/generate-output-review-pack.mjs" --out-dir $OutDir --render-scale $RenderScale --skip-render
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$manifestPath = Join-Path $OutDir "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$renderFailure = $false

foreach ($entry in $manifest) {
    if ($entry.format -ne "pdf") {
        continue
    }

    $relativePdfPath = $entry.outputPath -replace "/", "\"
    $absolutePdfPath = Join-Path $OutDir $relativePdfPath
    $absolutePngDir = Join-Path (Join-Path (Join-Path $OutDir "png") $entry.kind) $entry.key
    New-Item -ItemType Directory -Path $absolutePngDir -Force | Out-Null

    & python "scripts/render-pdf-pages.py" $absolutePdfPath $absolutePngDir $RenderScale
    if ($LASTEXITCODE -ne 0) {
        Write-Host "PNG render failed for $($entry.key)" -ForegroundColor Red
        $renderFailure = $true
    }
}

& node "scripts/update-output-review-pack.mjs" --out-dir $OutDir
$updateExit = $LASTEXITCODE

Write-Host "Output dir: $OutDir"
Write-Host "Manifest: $(Join-Path $OutDir 'manifest.json')"
Write-Host "Index: $(Join-Path $OutDir 'index.html')"

if ($renderFailure -or $updateExit -ne 0) {
    exit 1
}
