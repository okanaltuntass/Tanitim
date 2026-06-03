import { chromium, type Page, type BrowserContext } from 'playwright';
import * as readline from 'readline';
import * as path from 'path';
import * as os from 'os';

const TC_NO = '13768818114';
const EDEVLET_PASS = 'oKss83**16';
const PROFILE_DIR = path.join(process.cwd(), '.browser-profile');
const DYOP_HOME_URL = 'https://dyop.ticaret.gov.tr/dyop-main-side/';
const DYOP_LOGIN_URL = 'https://dyop.ticaret.gov.tr/dyop-web/loginServlet';
const COMPANY_NAME = 'IWA CONCEPT HEDİYELİK EŞYA MOBİLYA İTHALAT İHRACAT SANAYİ VE TİCARET LİMİTED ŞİRKETİ (ASIL)';

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve) => {
    rl.question(query, (ans: string) => {
      rl.close();
      resolve(ans);
    });
  });
}

async function askRequiredQuestion(query: string): Promise<string> {
  let answer = '';

  while (!answer) {
    answer = (await askQuestion(query)).trim();
  }

  return answer;
}

async function fillCaptchaIfRequired(page: Page): Promise<void> {
  const captcha = page.locator('#captchaField').first();
  await captcha.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});

  const hasCaptchaField = await captcha.count() > 0;
  const hasCaptchaText = await page.getByText('Güvenlik Kodu').first().isVisible().catch(() => false);

  if (!hasCaptchaField && !hasCaptchaText) {
    return;
  }

  console.log('========================================');
  console.log('  GÜVENLİK KODU GEREKLİ!');
  console.log('========================================');

  if (!hasCaptchaField) {
    await askQuestion('#captchaField bulunamadı. Sayfa bekletildi, devam etmek için Enter tuşuna basın...');
    return;
  }

  const captchaCode = await askRequiredQuestion('Güvenlik Kodu: ');
  await captcha.scrollIntoViewIfNeeded().catch(() => {});
  await captcha.fill(captchaCode);
}

async function fillEdevletCredentials(page: Page): Promise<void> {
  const tcField = page.locator('#tridField');
  const passwordField = page.locator('#egpField');

  await tcField.waitFor({ state: 'visible', timeout: 15000 });
  await passwordField.waitFor({ state: 'visible', timeout: 15000 });

  await tcField.fill(TC_NO);
  await passwordField.fill(EDEVLET_PASS);

  const passwordValue = await passwordField.inputValue().catch(() => '');
  if (passwordValue !== EDEVLET_PASS) {
    await passwordField.click();
    await passwordField.fill(EDEVLET_PASS);
  }
}

async function submitEdevletLogin(page: Page): Promise<void> {
  console.log('Kimlik bilgileri dolduruluyor...');
  await fillEdevletCredentials(page);
  await fillCaptchaIfRequired(page);
  await fillEdevletCredentials(page);

  console.log('Giriş yapılıyor...');
  await page.locator('button[name="submitButton"]').click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);

  const stillOnLoginForm = await page.locator('#tridField, #egpField').count() > 0;
  const captchaVisibleAfterSubmit = await page.locator('#captchaField').count() > 0
    || await page.getByText('Güvenlik Kodu').first().isVisible().catch(() => false);

  if (!stillOnLoginForm || !captchaVisibleAfterSubmit) {
    return;
  }

  await fillCaptchaIfRequired(page);
  await fillEdevletCredentials(page);
  console.log('Güvenlik kodu girildi, tekrar giriş yapılıyor...');
  await page.locator('button[name="submitButton"]').click();
}

async function launchContext(): Promise<BrowserContext> {
  const options = {
    headless: false,
    viewport: { width: 1280, height: 800 },
  };

  try {
    return await chromium.launchPersistentContext(PROFILE_DIR, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (!message.includes('Opening in existing browser session')) {
      throw err;
    }

    const tempProfileDir = path.join(os.tmpdir(), `dys-browser-profile-${Date.now()}`);
    console.log('.browser-profile şu an başka bir Chromium tarafından kullanılıyor.');
    console.log('Kalıcı oturumu kullanmak için açık test tarayıcısını kapatıp tekrar çalıştırın.');
    console.log(`Bu çalıştırma geçici profil ile devam ediyor: ${tempProfileDir}`);

    return chromium.launchPersistentContext(tempProfileDir, options);
  }
}

async function waitForSmsAndVerify(page: Page): Promise<void> {
  // Giriş butonuna tıklandıktan sonra navigasyonu bekle
  console.log('Giriş sonrası sayfa yüklemesi bekleniyor...');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  const postLoginUrl = page.url();
  console.log(`Giriş sonrası URL: ${postLoginUrl}`);

  // Eğer DYOP'a geri döndüyse SMS gerekmemiş demektir
  if (postLoginUrl.includes('dyop.ticaret.gov.tr') && !postLoginUrl.includes('loginServlet')) {
    console.log('Giriş başarılı, SMS doğrulama ekranı tetiklenmedi.');
    return;
  }

  // Eğer OAuth yetkilendirme sayfasına geldiyse oradan devam et
  if (postLoginUrl.includes('OAuth2AuthorizationServer/AuthorizationController')) {
    console.log('OAuth yetkilendirme sayfasına yönlenildi, SMS gerekmedi.');
    return;
  }

  console.log('SMS Doğrulama sayfası aranıyor...');
  const smsSelector = '#smsDogrulamaKodu';

  let smsFieldFound = false;
  for (let i = 0; i < 30; i++) {
    const count = await page.locator(smsSelector).count();
    if (count > 0) {
      smsFieldFound = true;
      break;
    }
    // Tekrar URL kontrolleri
    const currentUrl = page.url();
    if (currentUrl.includes('dyop.ticaret.gov.tr') && !currentUrl.includes('loginServlet')) {
      console.log('Giriş başarılı, SMS doğrulama ekranı tetiklenmedi.');
      return;
    }
    if (currentUrl.includes('OAuth2AuthorizationServer/AuthorizationController')) {
      console.log('OAuth yetkilendirme sayfasına yönlenildi, SMS gerekmedi.');
      return;
    }
    await page.waitForTimeout(3000);
  }

  if (!smsFieldFound) {
    console.log('SMS Doğrulama sayfası tespit edilemedi (veya zaten giriş yapıldı).');
    return;
  }

  console.log('========================================');
  console.log('  SMS DOĞRULAMA KODU GEREKLİ!');
  console.log('========================================');
  const smsCode = await askRequiredQuestion('Lütfen cep telefonunuza gelen SMS Doğrulama Kodunu girin: ');

  await page.locator(smsSelector).fill(smsCode);

  // SMS doğrulama butonuna tıkla
  const submitSelectors: string[] = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button[name="submitButton"]',
    'button.btn.btn-send',
  ];

  for (const selector of submitSelectors) {
    const btn = page.locator(selector);
    if (await btn.count() > 0) {
      console.log('SMS doğrulama butonu tıklanıyor...');
      await btn.first().click();
      break;
    }
  }

  await page.waitForLoadState('networkidle').catch(() => {});
}

async function handleOAuthAuthorizationPage(page: Page): Promise<void> {
  // "Ortak Giriş Noktası" yetkilendirme sayfasındaki "Giriş Yap" / onay butonunu tıkla
  const oauthBtnSelector = '#loginForm > fieldset > div > button.btn.btn-send';

  console.log('OAuth yetkilendirme sayfası kontrol ediliyor...');

  for (let i = 0; i < 10; i++) {
    if (page.url().includes('OAuth2AuthorizationServer/AuthorizationController')) {
      const btn = page.locator(oauthBtnSelector);
      if (await btn.count() > 0) {
        console.log('OAuth yetkilendirme butonu tıklanıyor...');
        await btn.first().click();
        await page.waitForLoadState('networkidle').catch(() => {});
        return;
      }
    }
    if (page.url().includes('dyop.ticaret.gov.tr') && !page.url().includes('loginServlet')) {
      console.log('DYOP ana sayfasına ulaşıldı.');
      return;
    }
    await page.waitForTimeout(2000);
  }
}

async function handleAcceptButton(page: Page): Promise<void> {
  console.log('Kabul Ediyorum / Devam Et butonu kontrol ediliyor...');
  const acceptBtnSelector = 'input[value*="Kabul Ediyorum"], button:has-text("Kabul Ediyorum"), input#gen__1338';

  for (let i = 0; i < 5; i++) {
    const acceptBtn = page.locator(acceptBtnSelector);
    if (await acceptBtn.count() > 0) {
      console.log('Kabul Ediyorum - Devam Et butonuna tıklanıyor...');
      await acceptBtn.first().click();
      await page.waitForLoadState('networkidle').catch(() => {});
      return;
    }
    await page.waitForTimeout(2000);
  }
  console.log('Kabul Ediyorum butonu bulunamadı (zaten onaylanmış veya farklı bir sayfadasınız).');
}

async function closeDyopPopupIfVisible(page: Page): Promise<void> {
  console.log('DYOP popup kapatma/Tamam butonu kontrol ediliyor...');
  const popupSelector = '.cs-popup-window, .cs-popup-msg-box';
  const closeBtnSelectors = [
    '#runtime-body > div:nth-child(7) > div.cs-popup-title > div.cs-popup-close-btn',
    '.cs-popup-title .cs-popup-close-btn',
    '#runtime-body > div.cs-popup-window.project-css.main-css.empty.cs-popup-msg-box > div.cs-popup-content > div > div > div > input',
    '#gen__1115',
    'input[type="button"][title="Kapat"]',
    'input[type="button"][value="Kapat"]',
    'input[type="button"][title="Tamam"]',
    'input[type="button"][value="Tamam"]',
    'button:has-text("Kapat")',
    'button:has-text("Tamam")',
    '[rel="button"][title="Kapat"]',
    '[rel="button"][title="Tamam"]',
  ];

  for (let i = 0; i < 6; i++) {
    let clicked = false;

    for (const selector of closeBtnSelectors) {
      const closeBtn = page.locator(selector).first();
      if (!await closeBtn.isVisible().catch(() => false)) {
        continue;
      }

      console.log(`Popup kapatılıyor: ${selector}`);
      await closeBtn.click({ force: true }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(700);
      clicked = true;

      const popupStillVisible = await page.locator(popupSelector).first().isVisible().catch(() => false);
      if (!popupStillVisible) {
        return;
      }
    }

    if (!clicked) {
      await page.waitForTimeout(1000);
      continue;
    }

    await page.waitForTimeout(1000);
  }

  console.log('Kapatılacak popup/Tamam mesajı bulunamadı.');
}

async function hasMissingSessionError(page: Page): Promise<boolean> {
  return await page.getByText('[FE00015]Oturum Bulunamadı!').first().isVisible().catch(() => false)
    || await page.getByText('Oturum Bulunamadı').first().isVisible().catch(() => false);
}

async function selectCompany(page: Page): Promise<void> {
  console.log('Firma seçimi kontrol ediliyor...');
  const companySelect = page.locator('#gen__1009');

  await companySelect.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});

  if (await companySelect.count() === 0) {
    console.log('Firma select alanı bulunamadı: #gen__1009');
    return;
  }

  for (let i = 0; i < 10; i++) {
    const options = await companySelect.locator('option').allTextContents();
    const hasCompany = options.some((option) => option.trim() === COMPANY_NAME);

    if (hasCompany) {
      console.log('Firma seçiliyor...');
      await companySelect.selectOption({ label: COMPANY_NAME });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1000);
      return;
    }

    await page.waitForTimeout(1000);
  }

  const options = await companySelect.locator('option').allTextContents();
  console.log('Firma seçeneği bulunamadı. Mevcut seçenekler:');
  for (const option of options) {
    console.log(`- ${option.trim()}`);
  }
}

async function openInvoicesPage(page: Page): Promise<void> {
  console.log('Faturalar menüsü açılıyor...');
  const menuSelectors = [
    '#_menu_org_kurulus_islem > a',
    '#_menu_org_kurulus_islem_yararlanici_evraki > a',
    '#_menu_org_fr_fatura_list > a',
  ];

  for (const selector of menuSelectors) {
    const menu = page.locator(selector).first();
    await menu.waitFor({ state: 'visible', timeout: 15000 });
    await menu.hover();
    await page.waitForTimeout(700);
  }

  await page.locator('#_menu_org_fr_fatura_list > a').first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);
}

async function run(): Promise<void> {
  console.log('Browser başlatılıyor (kalıcı profil kullanılıyor)...');
  console.log(`Profil dizini: ${PROFILE_DIR}`);

  const context: BrowserContext = await launchContext();

  const page: Page = context.pages()[0] ?? await context.newPage();

  // ──────────────────────────────────────────────
  // 1. Önce mevcut session ile DYOP ana sayfasına git
  // ──────────────────────────────────────────────
  console.log('DYOP ana sayfasına mevcut session ile gidiliyor...');
  await page.goto(DYOP_HOME_URL);
  await page.waitForLoadState('networkidle');

  const currentUrl = page.url();
  console.log(`Mevcut URL: ${currentUrl}`);

  const sessionMissing = await hasMissingSessionError(page);
  if (sessionMissing) {
    console.log('[FE00015] Oturum Bulunamadı tespit edildi, yeniden giriş yapılacak...');
    await page.goto(DYOP_LOGIN_URL);
    await page.waitForLoadState('networkidle').catch(() => {});
  }

  const urlAfterSessionCheck = page.url();

  // Eğer zaten DYOP ana sayfasındaysak (session aktif), direkt devam
  if (!sessionMissing && urlAfterSessionCheck.includes('dyop.ticaret.gov.tr') && !urlAfterSessionCheck.includes('loginServlet') && !urlAfterSessionCheck.includes('ortakgiris')) {
    console.log('Oturum zaten aktif, DYOP sayfasına doğrudan erişildi.');
  } else {
    // ──────────────────────────────────────────────
    // 2. E-Devlet ile Giriş butonuna tıkla
    // ──────────────────────────────────────────────
    const edevletBtn = page.locator('#social-EDevletDProd');
    if (await edevletBtn.count() > 0) {
      console.log('E-Devlet ile Giriş butonuna tıklanıyor...');
      await edevletBtn.click();

      console.log('e-Devlet Giriş Sayfasına yönlenme bekleniyor...');
      await page.waitForURL(/.*giris\.turkiye\.gov\.tr.*/, { timeout: 60000 });
      await page.waitForLoadState('networkidle');

      const edevletUrl = page.url();
      console.log(`e-Devlet URL: ${edevletUrl}`);

      // ──────────────────────────────────────────────
      // 3. OAuth yetkilendirme sayfası mı, yoksa giriş formu mu?
      // ──────────────────────────────────────────────
      if (edevletUrl.includes('OAuth2AuthorizationServer/AuthorizationController')) {
        // Session aktif, sadece yetkilendirmeyi onayla
        await handleOAuthAuthorizationPage(page);
      } else {
        await submitEdevletLogin(page);

        // ──────────────────────────────────────────────
        // 4. SMS Doğrulama
        // ──────────────────────────────────────────────
        await waitForSmsAndVerify(page);

        // ──────────────────────────────────────────────
        // 5. OAuth yetkilendirme sayfası kontrolü
        // ──────────────────────────────────────────────
        if (page.url().includes('OAuth2AuthorizationServer/AuthorizationController')) {
          await handleOAuthAuthorizationPage(page);
        }
      }
    } else {
      console.log('E-Devlet ile Giriş butonu bulunamadı, zaten farklı bir akıştayız.');
      if (page.url().includes('dyop.ticaret.gov.tr') && page.url().includes('loginServlet')) {
        await page.goto(DYOP_LOGIN_URL);
        await page.waitForLoadState('networkidle').catch(() => {});
      }
      // Belki OAuth sayfasındayız
      if (page.url().includes('OAuth2AuthorizationServer/AuthorizationController')) {
        await handleOAuthAuthorizationPage(page);
      }
    }
  }

  // ──────────────────────────────────────────────
  // 6. DYOP sayfasına dönüş bekle
  // ──────────────────────────────────────────────
  console.log('DYOP sayfasına dönüş bekleniyor...');
  await page.waitForURL(/.*dyop\.ticaret\.gov\.tr.*/, { timeout: 90000 }).catch(() => {
    console.log('DYOP sayfasına yönlendirme zaman aşımına uğradı.');
  });
  await page.waitForLoadState('networkidle').catch(() => {});

  await closeDyopPopupIfVisible(page);

  // ──────────────────────────────────────────────
  // 7. "Kabul Ediyorum - Devam Et" butonu
  // ──────────────────────────────────────────────
  await handleAcceptButton(page);
  await closeDyopPopupIfVisible(page);
  await selectCompany(page);
  await closeDyopPopupIfVisible(page);
  await openInvoicesPage(page);
  await closeDyopPopupIfVisible(page);

  await page.waitForTimeout(3000);

  // ──────────────────────────────────────────────
  // 8. Ekran görüntüsü al
  // ──────────────────────────────────────────────
  console.log('Ekran görüntüsü alınıyor...');
  const screenshotPath = path.join(process.cwd(), 'screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Ekran görüntüsü kaydedildi: ${screenshotPath}`);

  // Kullanıcı tarayıcıyı kapatana kadar bekle
  await askQuestion('\nTest tamamlandı. Tarayıcıyı kapatmak için Enter tuşuna basın...');
  await context.close();
}

run().catch((err: unknown) => {
  console.error('Hata oluştu:', err);
});
