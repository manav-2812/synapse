const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  await page.addInitScript(() => {
    localStorage.setItem('synapse_access', 'mock-token-12345');
    localStorage.setItem('synapse_user', JSON.stringify({
      id: 'usr_test123',
      email: 'manav@synapse.ai',
      full_name: 'Manav Baghel',
      created_at: '2026-08-20T10:00:00Z',
    }));
  });

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/analytics/dashboard')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          study_time_hours: 6.5,
          flashcards_due: 2,
          quizzes_completed: 1,
          recent_documents: [],
          recent_quizzes: []
        })
      });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.goto('http://127.0.0.1:5173/dashboard');
  await page.waitForTimeout(800);
  
  const hamburger = await page.$('.top-corner-hamburger-btn');
  if (hamburger) {
    await hamburger.click();
    await page.waitForTimeout(600);
  }
  
  await page.screenshot({ path: 'C:/Users/baghe/.gemini/antigravity-ide/brain/02aa97d0-d278-4ccb-a40a-c9a9d9e64acc/screenshots/mobile_sidebar_open_414px.png' });
  console.log('Saved mobile_sidebar_open_414px.png');
  await browser.close();
})();
