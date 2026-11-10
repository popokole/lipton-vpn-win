param(
    [Parameter(Mandatory)]
    [string]$OutputDirectory,
    [switch]$RequireSignature
)

$ErrorActionPreference = 'Stop'
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
$installerName = "Lipton-VPN-Setup-$version.exe"
$installer = Join-Path $OutputDirectory $installerName
$portable = Join-Path $OutputDirectory "LiptonVPN-$version-portable.exe"
$manifestPath = Join-Path $OutputDirectory 'latest.yml'

foreach ($artifact in @($installer, "$installer.blockmap", $portable, $manifestPath)) {
    if (!(Test-Path -LiteralPath $artifact -PathType Leaf)) { throw "Missing release asset: $artifact" }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw
$expectedHash = [regex]::Match($manifest, '(?m)^sha512:[ \t]*(\S+)[ \t]*\r?$').Groups[1].Value
$actualHash = [Convert]::ToBase64String([Convert]::FromHexString((Get-FileHash -LiteralPath $installer -Algorithm SHA512).Hash))
$escapedName = [regex]::Escape($installerName)
$listedHash = [regex]::Match($manifest, "(?m)^  - url: $escapedName\r?\n    sha512: (\S+)").Groups[1].Value
if ($manifest -notmatch "(?m)^version: $([regex]::Escape($version))\r?$" -or
    $manifest -notmatch "(?m)^path: $escapedName\r?$" -or
    $actualHash -cne $expectedHash -or $actualHash -cne $listedHash) {
    throw 'latest.yml does not match the installer and package version.'
}
Write-Output "Verified update metadata for Windows $version."

if (!$RequireSignature) { return }

$unpacked = Join-Path $OutputDirectory 'win-unpacked'
$binaries = @(
    $installer
    $portable
    (Join-Path $unpacked 'Lipton VPN.exe')
    (Join-Path $unpacked 'resources/elevate.exe')
    (Join-Path $unpacked 'resources/resources/xray/xray.exe')
    (Join-Path $unpacked 'resources/resources/sing-box/sing-box.exe')
)
$publisherThumbprint = $null
foreach ($binary in $binaries) {
    $signature = Get-AuthenticodeSignature -LiteralPath $binary
    if ($signature.Status -ne 'Valid' -or !$signature.TimeStamperCertificate) {
        throw "Expected a valid timestamped Authenticode signature on $binary. Status: $($signature.Status)"
    }
    $thumbprint = $signature.SignerCertificate.Thumbprint
    if (!$publisherThumbprint) { $publisherThumbprint = $thumbprint }
    if ($thumbprint -ne $publisherThumbprint) {
        throw "Publisher certificate does not match the installer: $binary"
    }
}
Write-Output "Verified Authenticode signatures on $($binaries.Count) Windows executables."
