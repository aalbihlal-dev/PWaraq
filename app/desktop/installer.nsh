; Right-click entries for PDF files (current user only, no administrator rights).
; "Open in Waraq" opens the viewer, "Edit with Waraq" opens the editor.
!macro customInstall
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\PwaraqView" ; entries from the earlier Pwaraq name
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\PwaraqEdit"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\WaraqView" "" "Open in Waraq"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\WaraqView" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\WaraqView\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --view "%1"'
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\WaraqEdit" "" "Edit with Waraq"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\WaraqEdit" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\WaraqEdit\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --edit "%1"'
!macroend
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\WaraqView"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\WaraqEdit"
!macroend

; Branded installer: Welcome -> Installing -> Finish ("Start Waraq"). Always for the current Windows user only,
; so the "install for anyone / only me" page is never shown and no administrator rights are needed.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Waraq PDF Studio"
  !define MUI_WELCOMEPAGE_TEXT "‫مرحباً بك في ورق.‬$\r$\n$\r$\nArabic and English PDF tools: view large drawings, edit pages, sign, merge, convert and more.$\r$\n$\r$\nWaraq installs for you only, without administrator rights, in under a minute. Office and OCR add-ons download later, only if you use them.$\r$\n$\r$\n‫أدوات PDF بالعربية والإنجليزية: عرض الرسومات الكبيرة، وتحرير الصفحات، والتوقيع، والدمج، والتحويل. يُثبَّت ورق لك وحدك دون صلاحيات مسؤول، في أقل من دقيقة.‬$\r$\n$\r$\nClick Next to continue.$\r$\n‫اضغط «التالي» للمتابعة.‬"
  !insertmacro MUI_PAGE_WELCOME
!macroend
