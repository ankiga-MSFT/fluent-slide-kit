param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$PresentationPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$inputPath = (Resolve-Path -LiteralPath $PresentationPath).Path
$archive = [System.IO.Compression.ZipFile]::OpenRead($inputPath)
try {
    $slideEntries = @($archive.Entries |
        Where-Object { $_.FullName -match '^ppt/slides/slide(\d+)\.xml$' } |
        Sort-Object { [int][regex]::Match($_.FullName, '(\d+)\.xml$').Groups[1].Value })
    $notesEntries = @($archive.Entries |
        Where-Object { $_.FullName -match '^ppt/notesSlides/notesSlide(\d+)\.xml$' } |
        Sort-Object { [int][regex]::Match($_.FullName, '(\d+)\.xml$').Groups[1].Value })

    $slides = foreach ($entry in $slideEntries) {
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { $xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $names = @([regex]::Matches($xml, 'name="(fluent-slide-kit:[^"]+)"') | ForEach-Object { $_.Groups[1].Value })
        $shapeGeometries = @([regex]::Matches($xml, '<p:sp>([\s\S]*?)</p:sp>') | ForEach-Object {
            $shapeXml = $_.Groups[1].Value
            $nameMatch = [regex]::Match($shapeXml, 'name="(fluent-slide-kit:[^"]+)"')
            if ($nameMatch.Success) {
                $presetMatch = [regex]::Match($shapeXml, '<a:prstGeom prst="([^"]+)"')
                [ordered]@{
                    name = $nameMatch.Groups[1].Value
                    preset = $(if ($presetMatch.Success) { $presetMatch.Groups[1].Value } else { '' })
                }
            }
        })
        $shapeCount = ([regex]::Matches($xml, '<p:sp>')).Count
        $pictureCount = ([regex]::Matches($xml, '<p:pic>')).Count
        [ordered]@{
            number = [int][regex]::Match($entry.FullName, '(\d+)\.xml$').Groups[1].Value
            shapes = $shapeCount
            pictures = $pictureCount
            namedObjects = $names
            shapeGeometries = $shapeGeometries
            screenshotOnly = ($shapeCount -eq 0 -and $pictureCount -eq 1)
        }
    }

    $notes = foreach ($entry in $notesEntries) {
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { $xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
        [ordered]@{
            number = [int][regex]::Match($entry.FullName, '(\d+)\.xml$').Groups[1].Value
            hasTakeaway = $xml.Contains('Takeaway:')
        }
    }

    [ordered]@{
        input = $inputPath
        bytes = (Get-Item -LiteralPath $inputPath).Length
        slides = @($slides)
        notes = @($notes)
    } | ConvertTo-Json -Depth 6 -Compress
}
finally {
    $archive.Dispose()
}