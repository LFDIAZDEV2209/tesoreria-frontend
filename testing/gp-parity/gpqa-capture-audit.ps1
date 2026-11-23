$ErrorActionPreference = 'Stop'
if (-not $env:MYSQL_PWD) { throw 'Set MYSQL_PWD locally; do not put credentials in artifacts.' }
$query = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'gpqa-phase2-audit-select.sql')
$lines = $query | & 'C:\Program Files\MySQL\MySQL Workbench 8.0 CE\mysql.exe' --protocol=TCP -h localhost -P 3306 -u root kpisdb --default-character-set=utf8mb4 --batch --raw
if ($LASTEXITCODE -ne 0) { throw 'SELECT failed' }
$rows = @($lines | ConvertFrom-Csv -Delimiter "`t")
$data = @{ capturedAt = [DateTime]::UtcNow.ToString('o'); target = 'localhost:3306/kpisdb'; query = 'gpqa-phase2-audit-select.sql'; rows = $rows }
$json = $data | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'artifacts/gpqa/P10-sql.json'), $json, [Text.UTF8Encoding]::new($false))
Write-Output "Audit SELECT: $($rows.Count) rows"
