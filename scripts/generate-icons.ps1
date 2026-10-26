$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetDirectory = Join-Path $PSScriptRoot '../assets'
$source = [System.Drawing.Image]::FromFile((Join-Path $assetDirectory 'RKEF_Ticketing_logo_transparent.png'))
try {
    foreach ($variant in @(
        @{ Size = 192; Maskable = $false; Name = 'icon-192.png' },
        @{ Size = 512; Maskable = $false; Name = 'icon-512.png' },
        @{ Size = 512; Maskable = $true; Name = 'icon-maskable-512.png' }
    )) {
        $size = $variant.Size
        $bitmap = New-Object System.Drawing.Bitmap($size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $attributes = New-Object System.Drawing.Imaging.ImageAttributes
        try {
            $background = if ($variant.Maskable) { [System.Drawing.ColorTranslator]::FromHtml('#102c3a') } else { [System.Drawing.Color]::Transparent }
            $graphics.Clear($background)
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
            # Fit all artwork inside the centered safe circle (radius 40% of canvas).
            # Preserve the full source: no cropping, stretching or recoloring.
            $scale = if ($variant.Maskable) {
                (0.8 * $size - 2) / [Math]::Sqrt($source.Width * $source.Width + $source.Height * $source.Height)
            } else { [Math]::Min($size / $source.Width, $size / $source.Height) }
            $width = [int][Math]::Floor($source.Width * $scale)
            $height = [int][Math]::Floor($source.Height * $scale)
            $rect = New-Object System.Drawing.Rectangle(([int][Math]::Floor(($size - $width) / 2)), ([int][Math]::Floor(($size - $height) / 2)), $width, $height)
            $graphics.DrawImage($source, $rect, 0, 0, $source.Width, $source.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
            $bitmap.Save((Join-Path $assetDirectory $variant.Name), [System.Drawing.Imaging.ImageFormat]::Png)
            Write-Output "Created $($variant.Name): $size x $size"
        } finally {
            $attributes.Dispose()
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
} finally { $source.Dispose() }
