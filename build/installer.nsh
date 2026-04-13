; ── Adrenalin Dünyası Custom Installer Theme ──
; Koyu tema + turuncu vurgular

; Renkler: Koyu arka plan, turuncu vurgu
!define MUI_BGCOLOR "0C0C14"
!define MUI_TEXTCOLOR "FFFFFF"

; Hoş geldin sayfası
!define MUI_WELCOMEPAGE_TITLE "Adrenalin Dünyası Kurulum Sihirbazı"
!define MUI_WELCOMEPAGE_TEXT "Bu sihirbaz Adrenalin Dünyası uygulamasını bilgisayarınıza kuracaktır.$\r$\n$\r$\nKuruluma devam etmek için İleri butonuna tıklayın."

; Bitirme sayfası
!define MUI_FINISHPAGE_TITLE "Kurulum Tamamlandı!"
!define MUI_FINISHPAGE_TEXT "Adrenalin Dünyası başarıyla kuruldu.$\r$\n$\r$\nUygulamayı başlatmak için Bitir butonuna tıklayın."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Adrenalin Dünyası'nı Başlat"

; Kaldırma onayı
!define MUI_UNCONFIRMPAGE_TEXT_TOP "Adrenalin Dünyası bilgisayarınızdan kaldırılacaktır."
