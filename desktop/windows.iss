#ifndef AppReleaseVersion
  #define AppReleaseVersion "1.0.0-rc.6"
#endif

[Setup]
AppId={{72F49713-F17E-4382-B17C-F47F4770A391}
AppName=Contour Studio
AppVersion={#AppReleaseVersion}
AppPublisher=Contour Studio contributors
DefaultDirName={localappdata}\Programs\Contour Studio
DefaultGroupName=Contour Studio
PrivilegesRequired=lowest
MinVersion=10.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\releases
OutputBaseFilename=Contour-Studio-Windows-x64-Setup
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\Contour Studio.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
LicenseFile=..\LICENSE
[Files]
Source: "..\desktop-dist\Contour Studio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "WebView2Bootstrapper.exe"; Flags: dontcopy
[Icons]
Name: "{group}\Contour Studio"; Filename: "{app}\Contour Studio.exe"
Name: "{autodesktop}\Contour Studio"; Filename: "{app}\Contour Studio.exe"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
[Run]
Filename: "{app}\Contour Studio.exe"; Description: "Open Contour Studio"; Flags: nowait postinstall skipifsilent

[Code]
const
  WebViewKey = 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function HasWebViewVersion(RootKey: Integer): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(RootKey, WebViewKey, 'pv', Version) and
    (Version <> '') and (Version <> '0.0.0.0');
end;

function WebViewInstalled: Boolean;
begin
  { Microsoft documents the machine key in the 32-bit registry view. }
  Result := HasWebViewVersion(HKEY_LOCAL_MACHINE_32) or
    HasWebViewVersion(HKEY_CURRENT_USER);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  if WebViewInstalled then
    Exit;
  WizardForm.StatusLabel.Caption := 'Preparing Microsoft WebView2. Please stay connected to the internet.';
  ExtractTemporaryFile('WebView2Bootstrapper.exe');
  if not Exec(ExpandConstant('{tmp}\WebView2Bootstrapper.exe'), '/silent /install',
    '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
  begin
    Result := 'Microsoft WebView2 could not start. Connect to the internet and try setup again.';
    Exit;
  end;
  Log(Format('WebView2 setup exit code: %d', [ExitCode]));
  { Recheck the runtime: an existing runtime or concurrent installer can affect
    the bootstrapper exit code. Do not finish with an unusable app. }
  if not WebViewInstalled then
    Result := 'Microsoft WebView2 could not be installed. Check your internet connection, then run setup again. If the problem continues, install the Microsoft WebView2 Evergreen Runtime from https://developer.microsoft.com/microsoft-edge/webview2/ and retry setup.';
end;
