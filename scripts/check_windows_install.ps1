# Run only on a disposable GitHub Windows runner: this installs and uninstalls the app.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') {
    throw 'This automated install trial is for disposable GitHub Actions runners. Follow DESKTOP.md for a personal-computer trial.'
}
$root = Split-Path $PSScriptRoot -Parent
$trial = Join-Path $env:RUNNER_TEMP 'Contour-Studio-Windows-check'
$install = Join-Path $trial 'Installed app'
$data = Join-Path $trial 'User data'
New-Item -ItemType Directory -Force $trial | Out-Null
$previousData = $env:CONTOUR_DATA_DIR
$previousPort = $env:CONTOUR_DESKTOP_PORT
$env:CONTOUR_DATA_DIR = $data
$env:CONTOUR_DESKTOP_PORT = '18767'
$app = $null
$report = [ordered]@{ installed = $false; rendered = $false; draftRestored = $false; engine = $false; updateReplaced = $false; uninstalled = $false }

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

function Wait-Button($process, [string]$name) {
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    $conditions = [System.Windows.Automation.Condition[]]@(
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $name),
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button),
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::IsOffscreenProperty, $false))
    $condition = [System.Windows.Automation.AndCondition]::new($conditions)
    while ([DateTime]::UtcNow -lt $deadline) {
        $process.Refresh()
        if ($process.HasExited) { throw "The installed app exited before rendering '$name'. See desktop.log." }
        if ($process.MainWindowHandle -ne 0) {
            $window = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
            $button = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
            if ($null -ne $button -and $button.Current.IsEnabled) { return $button }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "The native WebView2 interface did not render '$name' within 90 seconds."
}

function Close-App($process) {
    if (-not $process.CloseMainWindow()) { throw 'The native window could not be closed.' }
    if (-not $process.WaitForExit(15000)) { throw 'The app kept running after its window closed.' }
}

try {
    $installer = Join-Path $root 'releases/Contour-Studio-Windows-x64-Setup.exe'
    $setup = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', "/DIR=`"$install`"", "/LOG=`"$trial/setup.log`"") -PassThru
    if (-not $setup.WaitForExit(360000)) { $setup.Kill(); throw 'Windows setup timed out.' }
    if ($setup.ExitCode -ne 0) { throw "Windows setup failed: exit $($setup.ExitCode)." }
    $executable = Join-Path $install 'Contour Studio.exe'
    if (-not (Test-Path $executable)) { throw 'The installer did not create the app executable.' }
    $report.installed = $true

    $app = Start-Process -FilePath $executable -PassThru
    $button = Wait-Button $app 'Make it yours'
    $health = Invoke-RestMethod 'http://127.0.0.1:18767/api/health'
    if ($health.status -ne 'ok' -or $health.application -ne 'Contour Studio') { throw 'The installed local engine is unavailable.' }
    ([System.Windows.Automation.InvokePattern]$button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke()
    Wait-Button $app 'Review & make' | Out-Null
    $report.rendered = $true

    $window = [System.Windows.Automation.AutomationElement]::FromHandle($app.MainWindowHandle)
    $bounds = $window.Current.BoundingRectangle
    $bitmap = [System.Drawing.Bitmap]::new([int]$bounds.Width, [int]$bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen([int]$bounds.X, [int]$bounds.Y, 0, 0, $bitmap.Size)
        $bitmap.Save((Join-Path $root 'releases/Windows-first-launch.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    Start-Sleep -Seconds 2
    Close-App $app
    $app = Start-Process -FilePath $executable -PassThru
    Wait-Button $app 'Review & make' | Out-Null
    $report.draftRestored = $true
    Close-App $app
    $app = $null

    $engine = Join-Path $install 'ContourEngine.exe'
    $output = @(& $engine desktop.smoke (Join-Path $trial 'Generated artwork'))
    if ($LASTEXITCODE -ne 0) { throw 'The installed geometry engine failed.' }
    $engineReport = $output[-1] | ConvertFrom-Json
    if ($engineReport.status -ne 'ok') { throw 'The installed engine did not validate its STL/ZIP.' }
    $report.engine = $true

    # Exercise the exact updater helper against the installed app, preserving its draft.
    $updateTrial = Join-Path $trial 'Update helper'
    New-Item -ItemType Directory -Force $updateTrial | Out-Null
    $updateScript = Join-Path $updateTrial 'install.ps1'
    python -c "from desktop.updater import WINDOWS_SCRIPT; from pathlib import Path; import sys; Path(sys.argv[1]).write_text(WINDOWS_SCRIPT)" $updateScript
    $app = Start-Process -FilePath $executable -PassThru
    Wait-Button $app 'Review & make' | Out-Null
    $updatePlan = Join-Path $updateTrial 'plan.json'
    @{ pid = $app.Id; target = $install; installer = $installer; folder = $updateTrial;
       log = (Join-Path $trial 'update-install.log'); error = (Join-Path $trial 'update-error.txt') } |
        ConvertTo-Json | Set-Content -Encoding UTF8 $updatePlan
    $helper = Start-Process powershell.exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$updateScript`"", "`"$updatePlan`"") -PassThru
    Close-App $app
    $app = $null
    if (-not $helper.WaitForExit(240000)) { $helper.Kill(); throw 'The native update replacement timed out.' }
    if (Test-Path (Join-Path $trial 'update-error.txt')) { throw (Get-Content (Join-Path $trial 'update-error.txt') -Raw) }
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    do {
        $app = Get-Process -Name 'Contour Studio' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -eq $app) { Start-Sleep -Milliseconds 500 }
    } while ($null -eq $app -and [DateTime]::UtcNow -lt $deadline)
    if ($null -eq $app) { throw 'The updater did not relaunch the installed app.' }
    Wait-Button $app 'Review & make' | Out-Null
    $report.updateReplaced = $true
    Close-App $app
    $app = $null

} finally {
    if ($null -ne $app -and -not $app.HasExited) { $app.Kill(); $app.WaitForExit() }
    $uninstaller = Join-Path $install 'unins000.exe'
    if (Test-Path $uninstaller) {
        $uninstall = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -PassThru
        if ($uninstall.WaitForExit(120000)) {
            $report.uninstalled = ($uninstall.ExitCode -eq 0 -and -not (Test-Path (Join-Path $install 'Contour Studio.exe')))
        } else { $uninstall.Kill() }
    }
    $env:CONTOUR_DATA_DIR = $previousData
    $env:CONTOUR_DESKTOP_PORT = $previousPort
    $report | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $root 'releases/windows-install-check.json')
}
if (-not $report.uninstalled) { throw 'The app did not uninstall cleanly.' }
Write-Output 'PASS: Windows install, native WebView2 rendering, draft restoration, installed STL/ZIP engine and uninstall.'
