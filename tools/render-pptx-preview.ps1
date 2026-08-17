param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$PresentationPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,

    [int]$Width = 3840,

    [int]$Height = 2160
)

$ErrorActionPreference = 'Stop'
$inputPath = (Resolve-Path -LiteralPath $PresentationPath).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($outputPath) | Out-Null

$existingPowerPoint = Get-Process POWERPNT -ErrorAction SilentlyContinue
if ($existingPowerPoint) {
    throw 'An interactive PowerPoint session is already running. Preview rendering was skipped to avoid interrupting or closing user work.'
}

Get-ChildItem -LiteralPath $outputPath -Filter '*.PNG' -File | Remove-Item -Force

$powerPoint = $null
$presentation = $null
try {
    $powerPoint = New-Object -ComObject PowerPoint.Application
    $powerPoint.DisplayAlerts = 1
    $powerPoint.AutomationSecurity = 3
    $presentation = $powerPoint.Presentations.Open($inputPath, $true, $true, $false)
    $slideCount = $presentation.Slides.Count
    $presentation.Export($outputPath, 'PNG', $Width, $Height)
    $images = Get-ChildItem -LiteralPath $outputPath -Filter '*.PNG' | Sort-Object Name
    if ($images.Count -ne $slideCount) {
        throw "PowerPoint exported $($images.Count) previews for $slideCount slides."
    }
    [pscustomobject]@{
        input = $inputPath
        output = $outputPath
        slides = $slideCount
        width = $Width
        height = $Height
        images = @($images.FullName)
    } | ConvertTo-Json -Depth 4
}
finally {
    if ($presentation) {
        try { $presentation.Close() } finally { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
    }
    if ($powerPoint) {
        try { $powerPoint.Quit() } finally { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($powerPoint) }
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}