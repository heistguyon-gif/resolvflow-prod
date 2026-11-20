param([switch]$ArtifactsOnly)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$launch = [System.Diagnostics.ProcessStartInfo]::new()
$launch.FileName = 'node'
$launch.Arguments = '--require "./scripts/hide-console-preload.cjs" "./scripts/run-gates.cjs"'
if ($ArtifactsOnly) { $launch.Arguments += ' --artifacts-only' }
$launch.WorkingDirectory = $taskRoot
$launch.UseShellExecute = $false
$launch.CreateNoWindow = $true
$launch.RedirectStandardOutput = $true
$launch.RedirectStandardError = $true
$launch.StandardOutputEncoding = [System.Text.UTF8Encoding]::new()
$launch.StandardErrorEncoding = [System.Text.UTF8Encoding]::new()
$job = [System.Diagnostics.Process]::new()
$job.StartInfo = $launch
Write-Output 'LANDING_CHECKOUT_GATES_STARTED'
[void]$job.Start()
$out = $job.StandardOutput.ReadToEndAsync()
$err = $job.StandardError.ReadToEndAsync()
$job.WaitForExit()
$result = $out.Result + $err.Result
[System.IO.File]::WriteAllText((Join-Path $taskRoot 'evidence/job.log'), $result, [System.Text.UTF8Encoding]::new($false))
Write-Output $result
$code = $job.ExitCode
$job.Dispose()
exit $code
