$html = Get-Content "$PSScriptRoot\..\tests\fixtures\golden\03-chart.html" -Raw -Encoding UTF8
$base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($html))
$dataUri = "data:text/html;base64,$base64"
Write-Host "data:text/html;base64,$base64"
