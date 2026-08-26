const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  
  await page.addInitScript(() => {
    localStorage.setItem('synapse_access', 'mock-token-12345');
    localStorage.setItem('synapse_user', JSON.stringify({
      id: 'usr_test123',
      email: 'manav@synapse.ai',
      full_name: 'Manav',
      created_at: '2026-08-20T10:00:00Z',
    }));
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  await page.route('**/api/v1/**', async (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.goto('http://127.0.0.1:5173/chat');
  await page.waitForTimeout(800);
  
  // Set dark theme explicitly
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(300);

  await page.screenshot({ path: 'C:/Users/baghe/.gemini/antigravity-ide/brain/02aa97d0-d278-4ccb-a40a-c9a9d9e64acc/screenshots/premium_mobile_chat_414px_dark.png' });
  console.log('Saved premium_mobile_chat_414px_dark.png');
  await browser.close();
})();
