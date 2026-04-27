; Kill a running mnml process before install so the uninstaller
; can replace the locked executable during an over-the-top upgrade.
!macro preInit
  nsExec::Exec 'taskkill /f /im mnml.exe'
!macroend
