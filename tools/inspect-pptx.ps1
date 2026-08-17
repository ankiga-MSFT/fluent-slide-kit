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
    $mediaEntries = @($archive.Entries | Where-Object { $_.FullName -match '^ppt/media/' })
    $rasterMedia = @($mediaEntries | ForEach-Object {
        $stream = $_.Open()
        try {
            $buffer = [byte[]]::new(24)
            $read = $stream.Read($buffer, 0, $buffer.Length)
            if ($read -ge 24 -and $buffer[0] -eq 0x89 -and $buffer[1] -eq 0x50 -and $buffer[2] -eq 0x4E -and $buffer[3] -eq 0x47) {
                [ordered]@{
                    name = $_.Name
                    format = 'png'
                    width = ([uint32]$buffer[16] -shl 24) -bor ([uint32]$buffer[17] -shl 16) -bor ([uint32]$buffer[18] -shl 8) -bor [uint32]$buffer[19]
                    height = ([uint32]$buffer[20] -shl 24) -bor ([uint32]$buffer[21] -shl 16) -bor ([uint32]$buffer[22] -shl 8) -bor [uint32]$buffer[23]
                    bytes = $_.Length
                }
            }
        }
        finally {
            $stream.Dispose()
        }
    })

    $slides = foreach ($entry in $slideEntries) {
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { $xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $names = @([regex]::Matches($xml, 'name="(fluent-slide-kit:[^"]+)"') | ForEach-Object { $_.Groups[1].Value })
        $shapeGeometries = @([regex]::Matches($xml, '<p:sp>([\s\S]*?)</p:sp>') | ForEach-Object {
            $shapeXml = $_.Groups[1].Value
            $nameMatch = [regex]::Match($shapeXml, 'name="(fluent-slide-kit:[^"]+)"')
            if ($nameMatch.Success) {
                $presetMatch = [regex]::Match($shapeXml, '<a:prstGeom prst="([^"]+)"')
                $adjustmentMatch = [regex]::Match($shapeXml, '<a:gd name="adj" fmla="val (\d+)"')
                $fillMatch = [regex]::Match($shapeXml, '<p:spPr>[\s\S]*?<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"')
                $lineMatch = [regex]::Match($shapeXml, '<a:ln[^>]*>[\s\S]*?<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"')
                [ordered]@{
                    name = $nameMatch.Groups[1].Value
                    preset = $(if ($presetMatch.Success) { $presetMatch.Groups[1].Value } else { '' })
                    cornerAdjustment = $(if ($adjustmentMatch.Success) { [int]$adjustmentMatch.Groups[1].Value } else { $null })
                    fill = $(if ($fillMatch.Success) { $fillMatch.Groups[1].Value.ToUpperInvariant() } else { '' })
                    line = $(if ($lineMatch.Success) { $lineMatch.Groups[1].Value.ToUpperInvariant() } else { '' })
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
        media = [ordered]@{
            svg = @($mediaEntries | Where-Object { $_.Name -match '\.svg$' }).Count
            png = @($mediaEntries | Where-Object { $_.Name -match '\.png$' }).Count
            jpeg = @($mediaEntries | Where-Object { $_.Name -match '\.(jpg|jpeg)$' }).Count
            raster = $rasterMedia
        }
        slides = @($slides)
        notes = @($notes)
    } | ConvertTo-Json -Depth 6 -Compress
}
finally {
    $archive.Dispose()
}