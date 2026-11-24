; Hooks del instalador NSIS de ClipStudio (instalación por usuario -> HKCU).
; - ffmpeg NO va en el instalador: la app lo descarga una sola vez si falta
; - Agrega "Abrir como proyecto en ClipStudio" al menú contextual de los videos

!define CS_VERB "ClipStudio.OpenAsProject"

!macro CS_ADD_VERB EXT
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${CS_VERB}" "MUIVerb" "Abrir como proyecto en ClipStudio"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${CS_VERB}" "Icon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${CS_VERB}\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" --project $\"%1$\""
!macroend

!macro CS_DEL_VERB EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${CS_VERB}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro CS_ADD_VERB ".mp4"
  !insertmacro CS_ADD_VERB ".m4v"
  !insertmacro CS_ADD_VERB ".mov"
  !insertmacro CS_ADD_VERB ".mkv"
  !insertmacro CS_ADD_VERB ".webm"
  !insertmacro CS_ADD_VERB ".avi"
  ; Avisar al Explorador que cambiaron las asociaciones
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CS_DEL_VERB ".mp4"
  !insertmacro CS_DEL_VERB ".m4v"
  !insertmacro CS_DEL_VERB ".mov"
  !insertmacro CS_DEL_VERB ".mkv"
  !insertmacro CS_DEL_VERB ".webm"
  !insertmacro CS_DEL_VERB ".avi"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ; Los proyectos (en %APPDATA%) y ffmpeg (en %LOCALAPPDATA%) no se borran.
!macroend
