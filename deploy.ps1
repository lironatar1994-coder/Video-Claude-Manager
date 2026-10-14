# Deploys the video library: code -> GitHub (main), then a read-only snapshot -> https://lawebs.co.il/videos/
#   .\deploy.ps1                      commit + push + production
#   .\deploy.ps1 -Target GitHub       commit + push only
#   .\deploy.ps1 -Target Prod         production only (tree must be committed and pushed)
# Only videos the server doesn't have yet are uploaded. Videos never go to GitHub.
[CmdletBinding()]
param(
    [string]$CommitMessage = 'Update video library',
    [ValidateSet('All', 'GitHub', 'Prod')][string]$Target = 'All',
    [string]$SSHHost = 'root@vee-app.co.il',
    [string]$Origin = 'https://github.com/lironatar1994-coder/Video-Claude-Manager.git'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed ($LASTEXITCODE)" }
}
Push-Location $PSScriptRoot
try {
    if ($SSHHost -notmatch '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$') { throw 'Invalid SSH host' }
    $currentOrigin = (Invoke-Checked git @('remote', 'get-url', 'origin') | Out-String).Trim()
    if ($currentOrigin -ne $Origin) { throw "Unexpected origin: $currentOrigin" }
    if ((Invoke-Checked git @('branch', '--show-current') | Out-String).Trim() -ne 'main') { throw 'Switch to main before deploying.' }

    # ---- GitHub ----
    if ($Target -ne 'Prod') {
        Invoke-Checked git @('add', '-A')
        if (@(Invoke-Checked git @('diff', '--cached', '--name-only')).Count) {
            Invoke-Checked git @('commit', '-q', '-m', $CommitMessage)
        }
        Invoke-Checked git @('push', '-q', '-u', 'origin', 'HEAD:main')
    }
    if (@(Invoke-Checked git @('status', '--porcelain')).Count) { throw 'Commit changes first (or run without -Target Prod).' }
    $revision = (Invoke-Checked git @('rev-parse', 'HEAD') | Out-String).Trim()
    $remote = ((Invoke-Checked git @('ls-remote', 'origin', 'refs/heads/main') | Out-String).Trim() -split '\s+')[0]
    if ($revision -ne $remote) { throw 'GitHub main does not match this revision - push first.' }
    Write-Host "GitHub: main @ $($revision.Substring(0, 7))" -ForegroundColor Green
    if ($Target -eq 'GitHub') { return }

    # ---- Production ----
    $base = '/opt/video-library'
    $releaseId = Get-Date -Format 'yyyyMMdd-HHmmss'

    Invoke-Checked node @('scripts/build-static.mjs')
    Copy-Item 'dist/media.txt' 'dist/www/media.txt'
    New-Item -ItemType Directory -Force 'dist/www/_api' | Out-Null
    Copy-Item 'api/server.mjs' 'dist/www/_api/server.mjs'
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'dist/www/revision.txt'), "$revision`n")
    $archive = Join-Path $PSScriptRoot 'dist/release.tar.gz'
    Invoke-Checked tar.exe @('-czf', $archive, '-C', 'dist/www', '.')

    Invoke-Checked ssh @('-o','BatchMode=yes','-o','ConnectTimeout=15',$SSHHost,"mkdir -p $base/incoming/media $base/media")
    $remoteMedia = @(& ssh -o BatchMode=yes $SSHHost "ls -1 $base/media")
    if ($LASTEXITCODE -ne 0) { throw 'Could not list remote media' }
    $needed = @(Get-Content 'dist/media.txt' | Where-Object { $_ })
    $missing = @($needed | Where-Object { $remoteMedia -notcontains $_ })
    if ($missing.Count) {
        $bytes = ($missing | ForEach-Object { (Get-Item "data/web/$_").Length } | Measure-Object -Sum).Sum
        Write-Host ("Uploading {0} videos ({1:N0} MB)..." -f $missing.Count, ($bytes / 1MB))
        $files = @($missing | ForEach-Object { "data/web/$_" })
        Invoke-Checked scp (@('-q') + $files + @("${SSHHost}:$base/incoming/media/"))
    } else {
        Write-Host 'No new videos to upload.'
    }

    Invoke-Checked scp @('-q', $archive, "${SSHHost}:$base/incoming/$releaseId.tar.gz")
    # Uploaded rather than piped: Windows PowerShell prepends a BOM to piped stdin.
    Invoke-Checked scp @('-q', 'scripts/deploy-linux.sh', "${SSHHost}:$base/incoming/deploy-linux.sh")
    & ssh -o BatchMode=yes $SSHHost "tr -d '\r' < $base/incoming/deploy-linux.sh | bash -s -- $releaseId"
    if ($LASTEXITCODE -ne 0) { throw 'Production deployment failed (the previous release stays live)' }

    $liveRevision = (Invoke-WebRequest 'https://lawebs.co.il/videos/revision.txt' -UseBasicParsing -Headers @{ 'Cache-Control' = 'no-cache' }).Content.Trim()
    if ($liveRevision -ne $revision) { throw "Live revision mismatch (live $liveRevision, expected $revision)" }
    $live = Invoke-RestMethod 'https://lawebs.co.il/videos/data.json' -Headers @{ 'Cache-Control' = 'no-cache' }
    $rev = (Get-Content 'dist/rev.txt' -Raw).Trim()
    if ([string]$live.rev -ne $rev) { throw "Live library mismatch (live $($live.rev), built $rev)" }
    # The local app reads client feedback with the team key; fetch it once.
    $keyFile = Join-Path $PSScriptRoot 'data/team.key'
    if (-not (Test-Path $keyFile)) {
        $key = (& ssh -o BatchMode=yes $SSHHost 'cat /var/lib/video-library/team.key' | Out-String).Trim()
        if ($LASTEXITCODE -eq 0 -and $key -match '^[0-9a-f]{48}$') { [IO.File]::WriteAllText($keyFile, $key) }
    }
    try {
        $health = Invoke-RestMethod 'https://lawebs.co.il/videos/api/health'
        Write-Host "Review API: ok ($($health.events) events)"
    } catch { Write-Warning 'Review API is not answering - client approvals/comments will not save.' }
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'data/published.json'), (@{ rev = [int]$rev; revision = $revision; at = (Get-Date).ToString('o') } | ConvertTo-Json -Compress))
    Write-Host "Live: https://lawebs.co.il/videos/  ($($live.videos.Count) videos, $($revision.Substring(0, 7)))" -ForegroundColor Green
} finally { Pop-Location }
