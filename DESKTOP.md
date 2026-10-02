# Contour Studio desktop

The desktop app opens Contour Studio in a native window and bundles its Python geometry engine. Each user's computer builds its own artwork. There is no hosted generation service, account, or generation charge.

**Status: desktop release candidate.** The combined source suite passes 205 Python tests. Windows setup has passed an actual installation, native WebView2 rendering, draft restoration, installed-engine watertight STL/ZIP generation and uninstall trial on a GitHub Windows runner. The Apple Silicon app has been opened in its native window and passed its frozen-engine check. The current candidates include the final frame/colour fixes and a Windows window size that adapts to smaller or scaled displays. Personal-computer display scaling, native file downloads and a real-data Windows generation still need manual trials. Intel Mac remains untested. See [UI-REVIEW.md](UI-REVIEW.md) and [VERIFICATION.md](VERIFICATION.md) for the evidence and limits.

## Install a release

Use the installer matching your computer. Windows x64 and Apple Silicon candidates are saved in the local `releases/` folder. Windows build artifacts are also available through [Firethorn's installer workflow](https://github.com/FirethornDigitalAdmin/contour-studio/actions/workflows/desktop.yml). Intel Mac must be built and tested on its target system. Download public installers from [Releases](https://github.com/FirethornDigitalAdmin/contour-studio/releases/tag/v1.0.0-rc.1), or use the [download website](https://firethorndigitaladmin.github.io/contour-studio/#downloads). Intel Mac remains an untested build target and is not included in this public preview.

| Computer | File | Install |
| --- | --- | --- |
| Apple Silicon Mac | `Contour-Studio-macOS-arm64.dmg` | Open the disk image, drag Contour Studio to Applications, then open it. |
| Intel Mac | `Contour-Studio-macOS-x86_64.dmg` | Open the disk image, drag Contour Studio to Applications, then open it. |
| Windows x64 | `Contour-Studio-Windows-x64-Setup.exe` | Run the installer, then open Contour Studio from the Start menu. |

Python and Node.js are included or unnecessary for installed users. Internet is needed for map search, the basemap and uncached geographic data. Windows x64 requires Windows 10 or later. Setup checks for Microsoft WebView2, installs it only if missing, and verifies it before continuing. Stay connected to the internet for this step. If setup reports that WebView2 could not be installed, check the connection and retry; you can also install the [WebView2 Evergreen Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) directly, then retry setup. Existing runtimes are detected using [Microsoft's documented registry locations](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution#detect-if-a-webview2-runtime-is-already-installed).

Community builds are unsigned and Mac builds are not notarised. Download only a build you trust. macOS may require **System Settings → Privacy & Security → Open Anyway**; Windows may show an unknown-publisher prompt. Distribution with verified publisher identity requires separate signing credentials.

Closing the app stops any active generation. Completed projects remain available on the next launch. The engine listens on `127.0.0.1:8767` and runs one model at a time.

## Optional thank you

The app is completely free and open source. The toolbar and Help panel link to [Buy Me a Coffee](https://www.buymeacoffee.com/LouisGoldsbrough). This is an optional thank you: downloads and every feature are available without donating.

## Projects and updates

| Computer | Projects, caches and diagnostics |
| --- | --- |
| Mac | `~/Library/Application Support/Contour Studio/` |
| Windows | `%LOCALAPPDATA%\Contour Studio\` |

Back up this folder before updating. Installing a new app version keeps user data separate from the program files. `projects/` contains completed artwork; `cache/` contains downloaded map data; `desktop.log` helps diagnose startup failures. Browser drafts use the same folder's `browser/` storage. An older local-browser ZIP keeps data in its extracted `data/` folder; copy its `projects/` and `cache/` into the new user-data folder to migrate completed work.

## Build on GitHub

1. Push the clean source to your repository.
2. Open [Firethorn Actions](https://github.com/FirethornDigitalAdmin/contour-studio/actions) → **Build desktop installers → Run workflow**, choose Windows x64 (the default) or the required Mac target, and run it.
3. The workflow builds on native macOS Apple Silicon, macOS Intel and Windows x64 runners, runs the Python/frontend checks, then smoke-tests the frozen geometry engine. The Windows job also installs the setup EXE, checks real WebView2 buttons, changes a workflow step, closes/reopens to check draft persistence, generates an offline STL/ZIP using the installed engine, and uninstalls the app. Its report, screenshot and logs are saved as **Windows-install-evidence**. This trial has passed on Windows.
4. Download successful installer artifacts and test them on the matching computers. Check first launch, map interaction, a real-data generation, native file downloads and saved projects after reopening. On Windows, check 100%, 125%, 150% and 200% display scaling. The automatic check does not cover these personal-computer journeys. Attach verified installers to a GitHub Release.

The workflow is manual so ordinary edits do not rebuild three large installers. It creates artifacts; it does not publish a release or sign the application. Artifacts are retained for three days, so save the installer locally or attach it to a release when ready to distribute. The final Windows candidate is from [successful build #3](https://github.com/FirethornDigitalAdmin/contour-studio/actions/runs/37073307852), commit `3772edf`. Both downloaded artifact archives match GitHub's SHA-256 digests. See [GitHub's Actions billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions) for runner use and artifact-storage allowances.

## Build locally

Use Python 3.12 and Node.js 22.12+ on the operating system you are targeting. PyInstaller does not cross-compile a Windows app on Mac or vice versa.

```sh
python -m venv .venv
# Mac: source .venv/bin/activate
# Windows: .venv\Scripts\activate
python -m pip install -r requirements-desktop.txt
npm install --global pnpm@10
pnpm install --frozen-lockfile
pnpm build
python -m desktop.main
```

Create a frozen application and check its bundled engine:

```sh
python -m PyInstaller --noconfirm --distpath desktop-dist --workpath build-desktop desktop/contour.spec
python scripts/check_desktop.py
```

On Mac, run `python scripts/package_desktop.py` to create the DMG in `releases/`. On Windows, download the [Microsoft WebView2 bootstrapper](https://go.microsoft.com/fwlink/p/?LinkId=2124703) to `desktop/WebView2Bootstrapper.exe`, install [Inno Setup 6](https://jrsoftware.org/isinfo.php), and compile `desktop/windows.iss`; the setup EXE is written to `releases/`. Build each Mac architecture on matching hardware or its workflow runner.

If the local app reports that its connection is in use, close the other copy or check whether another program is using port 8767. A failed engine startup now shows a recovery window with the diagnostic-log location. If the native browser runtime cannot open, a system dialog gives the next step; on Windows, retry setup with internet access to repair WebView2. See [START-HERE.md](START-HERE.md) for the local-browser fallback and generation help.
