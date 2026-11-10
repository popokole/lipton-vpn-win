!include nsDialogs.nsh
!define MUI_FINISHPAGE_RUN_NOTCHECKED

!ifndef BUILD_UNINSTALLER
Var LiptonDesktopCheckbox
Var LiptonDesktopChoice

!macro customPageAfterChangeDir
  Page custom LiptonOptionsPage LiptonOptionsLeave

Function LiptonOptionsPage
  ${If} ${isUpdated}
  ${OrIf} ${isNoDesktopShortcut}
    Abort
  ${EndIf}

  ${If} $LANGUAGE == 1049
    !insertmacro MUI_HEADER_TEXT "Параметры установки" "Выберите, создавать ли ярлык на рабочем столе."
    StrCpy $0 "Создать ярлык на рабочем столе"
  ${Else}
    !insertmacro MUI_HEADER_TEXT "Installation options" "Choose whether to create a desktop shortcut."
    StrCpy $0 "Create a desktop shortcut"
  ${EndIf}
  nsDialogs::Create 1018
  Pop $1
  ${If} $1 == error
    Abort
  ${EndIf}

  ${NSD_CreateCheckbox} 0u 12u 100% 14u "$0"
  Pop $LiptonDesktopCheckbox

  ${If} $LiptonDesktopChoice == ""
    !insertmacro setLinkVars
    ${If} ${FileExists} "$oldDesktopLink"
    ${OrIfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      StrCpy $LiptonDesktopChoice ${BST_CHECKED}
    ${Else}
      StrCpy $LiptonDesktopChoice ${BST_UNCHECKED}
    ${EndIf}
  ${EndIf}
  ${NSD_SetState} $LiptonDesktopCheckbox $LiptonDesktopChoice
  nsDialogs::Show
FunctionEnd

Function LiptonOptionsLeave
  ${NSD_GetState} $LiptonDesktopCheckbox $LiptonDesktopChoice
FunctionEnd
!macroend

!macro customInstall
  ${If} $LiptonDesktopChoice == ${BST_UNCHECKED}
    Delete "$newDesktopLink"
  ${ElseIf} $LiptonDesktopChoice == ${BST_CHECKED}
  ${AndIfNot} ${FileExists} "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${EndIf}
!macroend
!endif
