# Start Contour Studio

Contour Studio turns a real place into a 3D-printable relief map. Your own computer builds models and stores projects, so each installation works independently.

## Install the desktop app

Use `Contour-Studio-Windows-x64-Setup.exe` on Windows, or `Contour-Studio-macOS-arm64.dmg` on Apple Silicon Mac. Candidates are saved in the project's `releases/` folder; Windows downloads are also available from successful runs of [Firethorn's installer workflow](https://github.com/FirethornDigitalAdmin/contour-studio/actions/workflows/desktop.yml). On Mac, open the DMG and drag Contour Studio to Applications. On Windows, run the setup EXE and open the app from the Start menu. Installed users do not need Python, Node.js or a terminal.

These are unsigned release candidates. Windows has passed an automated installation, native UI, draft-restoration, generation and uninstall trial; Apple Silicon has passed native launch and engine checks. Intel Mac remains untested. See [DESKTOP.md](DESKTOP.md) for the remaining personal-computer trials, user-data locations and unsigned-build guidance. The local-browser ZIP remains available below.

## Use the free web workspace

The website lets you choose a place, dimensions and style, then export design settings. Open an installed or local copy, import those settings and generate your print files. The free website does not run model generation. See [HOSTING.md](HOSTING.md) to host the workspace yourself.

## Use the local-browser ZIP

1. Download **Contour-Studio-local.zip** from GitHub Releases when published, or use a shared ZIP. Extract the whole folder somewhere writable, such as Documents. Do not run it inside the ZIP.
2. Install **Python 3.12** from [python.org](https://www.python.org/downloads/). On Windows, enable **Add Python to PATH** if offered. On Linux, install the matching Python `venv` package if needed.
3. Open the launcher for your computer:

| Computer | Open |
| --- | --- |
| Mac | Double-click `start.command`, or open Terminal in the extracted folder and run `bash start.command`. |
| Windows | Double-click `start.bat`. |
| Linux | Open a terminal in the extracted folder and run `bash start.sh`. |

First launch downloads Python dependencies and can take several minutes. Later launches reuse them. The local ZIP contains the compiled interface; Node.js and Codex are not needed.

Your browser opens at **http://127.0.0.1:8765**. Keep the terminal open while using the app. If the browser does not open, enter that address yourself. Ctrl+C stops the app and interrupts any running generation.

## Make your first artwork

1. **Place & size:** find a place, select its area and choose the artwork size and printer.
2. **Style:** choose terrain, buildings, frame and any special-place symbols.
3. **Make:** generate the model, inspect the 3D preview and download the print pack.

Start with a small area and **Draft** or **Standard** quality. Detailed cities and high quality settings need more memory and time. For tree shapes and field rows, choose **Style → Forests & fields → Add landscape detail**. For an AMS print, enable **Print colours → Multicolour print package**, choose a palette, then import each piece's colour 3MF into Bambu Studio and assign its named parts to your filaments.

Check your slice preview and print the fit coupon before printing the full artwork. See [README.md](README.md) for geometry, assembly and data-source details.

## Keep your work

- Desktop app: projects live in the user-data folder listed in [DESKTOP.md](DESKTOP.md). Back up that folder before updates.
- Local-browser ZIP: completed projects live in `data/projects/` and map downloads in `data/cache/`. Back up `data/`; copy it into a new local-browser folder when updating. Do not copy `.venv` between computers.
- Internet is needed for installation, map search/background and uncached geographic data. The app is not fully offline.
- Refreshing reconnects to an active generation. Closing or restarting the app interrupts unfinished work; completed print packs remain in **My projects**.
- Sharing a ZIP lets others run their own copy. A `127.0.0.1` address works only on the computer running it.

## Setup help

**Python cannot be found:** reopen the terminal after installing Python. Try `python start.py` on Windows or `python3 start.py` on Mac/Linux with Python 3.12.

**Dependencies could not install:** check the terminal's last error, internet access and free disk space. On Linux, an `ensurepip` error usually means the matching `venv` package is missing.

**It asks for Node.js:** use **Contour-Studio-local.zip** rather than the source ZIP, or follow the source setup in README.md.

**Port 8765 is in use:** another local-browser copy may be running. Open http://127.0.0.1:8765 or close the other copy. The desktop app uses port 8767.

**Generation failed:** keep your settings, read the message and retry. Geographic services can be busy; a smaller selection or lower surface quality can reduce data and memory requirements.

The application code is MIT licensed. Map data and dependencies have their own licences; see the attribution in README.md and generated print packs.
