; electron-builder includes build/installer.nsh in the Windows installer.

; Agent Commons 0.4.2 and earlier shipped the Commons app as a pnpm tree of
; about 21,000 files with very deep paths. An upgrade runs the old uninstaller,
; which moves every installed file aside one at a time. On that tree it takes
; very long and can fail on the deep paths. The installer then installs over
; the old tree, whose copy of Next.js cannot find styled-jsx, and the app fails
; to start.
;
; Close the app as usual, then delete the previous Commons app bundle with a
; delete that handles long paths, before the old uninstaller runs.

; Defining customCheckAppRunning stops electron-builder from including what its
; default check uses (see allowOnlyOneInstallerInstance.nsh), so include it here.
!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
  ${if} ${FileExists} "$INSTDIR\resources\commons-app\*.*"
    DetailPrint "Removing the previous Commons app bundle"
    nsExec::Exec `"$CmdPath" /C rd /s /q "\\?\$INSTDIR\resources\commons-app"`
    Pop $0
  ${endIf}
!macroend
