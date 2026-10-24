param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$fullPath = [System.IO.Path]::GetFullPath($Path)
$directory = [System.IO.Path]::GetDirectoryName($fullPath)

if ([System.IO.Path]::GetExtension($fullPath) -ine '.accdb') {
  throw 'The Access database path must end in .accdb.'
}
if (Test-Path -LiteralPath $fullPath) {
  throw "Refusing to overwrite an existing database: $fullPath"
}
if (-not (Test-Path -LiteralPath $directory)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$catalog = $null
try {
  $catalog = New-Object -ComObject ADOX.Catalog
  $catalog.Create("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$fullPath;")
} catch {
  throw "Could not create the Access database. Install the 64-bit Microsoft Access Database Engine. $($_.Exception.Message)"
} finally {
  if ($catalog) {
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($catalog) | Out-Null
  }
}

Write-Output "Created empty Access database: $fullPath"
