; Hooks del instalador NSIS de ReelCut (instalación por usuario -> HKCU).
; - Crea la carpeta de proyectos en Videos\Reelcut
; - Agrega "Abrir como proyecto en ReelCut" al menú contextual de los videos

!define RC_VERB "ReelCut.OpenAsProject"

!macro RC_ADD_VERB EXT
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${RC_VERB}" "MUIVerb" "Abrir como proyecto en ReelCut"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${RC_VERB}" "Icon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${RC_VERB}\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" --project $\"%1$\""
!macroend

!macro RC_DEL_VERB EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${RC_VERB}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  SetShellVarContext current
  CreateDirectory "$VIDEOS\Reelcut"
  !insertmacro RC_ADD_VERB ".mp4"
  !insertmacro RC_ADD_VERB ".m4v"
  !insertmacro RC_ADD_VERB ".mov"
  !insertmacro RC_ADD_VERB ".mkv"
  !insertmacro RC_ADD_VERB ".webm"
  !insertmacro RC_ADD_VERB ".avi"
  ; Avisar al Explorador que cambiaron las asociaciones
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro RC_DEL_VERB ".mp4"
  !insertmacro RC_DEL_VERB ".m4v"
  !insertmacro RC_DEL_VERB ".mov"
  !insertmacro RC_DEL_VERB ".mkv"
  !insertmacro RC_DEL_VERB ".webm"
  !insertmacro RC_DEL_VERB ".avi"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ; La carpeta Videos\Reelcut NO se borra: contiene los proyectos del usuario.
!macroend
