# DYS Otomasyon

DYOP e-Devlet giriş ve sayfa yönlendirme otomasyonu.

## Kurulum

```bash
npm install
```

Playwright tarayıcısı eksikse:

```bash
npx playwright install chromium
```

## Çalıştırma

```bash
npm run dev
```

Komut tarayıcıyı açar, mevcut `.browser-profile` session bilgisini kullanır. Oturum yoksa e-Devlet giriş akışını başlatır.

Güvenlik kodu veya SMS gerekiyorsa terminalden sorulur.

## Notlar

- Kalıcı profil dizini: `.browser-profile`
- Profil kullanımda hatası alınırsa açık test tarayıcısını kapatın.
- Giriş sonrası firma seçilir ve Faturalar ekranına gidilir.
