; Included by electron-builder into the Windows installer (the default build/installer.nsh).
;
; Writes this installation's ID beside the app: the local date and time it was installed. On its
; first start, PageBinder compares it with the ID recorded in its settings folder to tell a
; reinstall (which asks whether to keep earlier settings) from an update (which keeps them).
; See src/main/settingsFolder.ts.

!include "FileFunc.nsh"

!macro customInstall
  ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
  FileOpen $9 "$INSTDIR\resources\install-id.txt" w
  FileWrite $9 "$2-$1-$0 $4:$5:$6"
  FileClose $9
!macroend
