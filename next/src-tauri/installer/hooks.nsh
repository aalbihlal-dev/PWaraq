; Waraq installer hooks (Tauri NSIS template). Everything here is for the current Windows user only (HKCU) and is
; removed again by the uninstaller. PDF files are *offered* ("Open with Waraq" in the Open-with list), never taken
; over as the default; .waraq files are Waraq's own and are associated by the template. Both file types get a
; right-click "Open in Waraq" entry. The verb text follows the installer language (1025 = Arabic).

!macro NSIS_HOOK_POSTINSTALL
  StrCpy $0 "Open in Waraq"
  ${If} $LANGUAGE == 1025
    StrCpy $0 "فتح في ورق"
  ${EndIf}
  ; PDF: a ProgId in the Open-with list, the default handler untouched
  WriteRegStr HKCU "Software\Classes\Waraq.PDF" "" "PDF document"
  WriteRegStr HKCU "Software\Classes\Waraq.PDF\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\Waraq.PDF\shell\open" "" "$0"
  WriteRegStr HKCU "Software\Classes\Waraq.PDF\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.pdf\OpenWithProgids" "Waraq.PDF" ""
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "Waraq"
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".pdf" ""
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".waraq" ""
  ; right-click "Open in Waraq"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\OpenInWaraq" "" "$0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\OpenInWaraq" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\OpenInWaraq\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.waraq\shell\OpenInWaraq" "" "$0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.waraq\shell\OpenInWaraq" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.waraq\shell\OpenInWaraq\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  ; the updater keeps this installer so a version that fails to start can be rolled back (src-tauri/src/update.rs)
  CreateDirectory "$APPDATA\${BUNDLEID}\updates"
  CopyFiles /SILENT "$EXEPATH" "$APPDATA\${BUNDLEID}\updates\waraq-${VERSION}.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)' ; Explorer reads the new entries
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Waraq.PDF"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "Waraq.PDF"
  DeleteRegKey HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\OpenInWaraq"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.waraq\shell\OpenInWaraq"
  DeleteRegKey /ifempty HKCU "Software\Classes\SystemFileAssociations\.waraq\shell"
  DeleteRegKey /ifempty HKCU "Software\Classes\SystemFileAssociations\.waraq"
  RMDir /r "$APPDATA\${BUNDLEID}\updates"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
