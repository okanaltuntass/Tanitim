import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log('Navigating...');
  await page.goto('https://dyop.ticaret.gov.tr/dyop-web/loginServlet');
  await page.waitForLoadState('networkidle');
  await page.locator('#social-EDevletDProd').click();
  await page.waitForURL(/.*giris\.turkiye\.gov\.tr.*/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  
  // Find all elements that look like a submit button or login button
  const clickables = await page.locator('button, input[type="submit"], input[type="button"], .submitButton, .btn').all();
  console.log('Clickable elements:');
  for (const el of clickables) {
    const tagName = await el.evaluate(e => e.tagName);
    const id = await el.getAttribute('id').catch(() => '');
    const name = await el.getAttribute('name').catch(() => '');
    const className = await el.getAttribute('class').catch(() => '');
    const text = await el.textContent().catch(() => '');
    console.log(`- Element: tag=${tagName}, id="${id}", name="${name}", class="${className}", text="${text?.trim()}"`);
  }
  
  await browser.close();
}

run().catch(console.error);
