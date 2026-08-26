const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  
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
    if (url.includes('/documents')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'doc_1',
            user_id: 'usr_test123',
            filename: 'doc1.pdf',
            original_filename: 'Synapse_Retrieval_Augmented_Generation_Study_Assistant_6.pdf',
            file_type: 'pdf',
            status: 'completed',
            chunk_count: 42,
            file_size_bytes: 1048576,
            created_at: '2026-08-20T10:00:00Z'
          },
          {
            id: 'doc_2',
            user_id: 'usr_test123',
            filename: 'doc2.docx',
            original_filename: 'Synapse_Retrieval_Augmented_Generation_Study_Assistant_1.docx',
            file_type: 'docx',
            status: 'completed',
            chunk_count: 28,
            file_size_bytes: 2048576,
            created_at: '2026-08-21T10:00:00Z'
          },
          {
            id: 'doc_3',
            user_id: 'usr_test123',
            filename: 'doc3.pdf',
            original_filename: 'Distributed Systems Architecture & Design Patterns.pdf',
            file_type: 'pdf',
            status: 'completed',
            chunk_count: 15,
            file_size_bytes: 512000,
            created_at: '2026-08-22T10:00:00Z'
          }
        ])
      });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.goto('http://127.0.0.1:5173/chat');
  await page.waitForTimeout(1000);
  
  const scopeTrigger = await page.$('.scope-trigger');
  if (scopeTrigger) {
    await scopeTrigger.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'C:/Users/baghe/.gemini/antigravity-ide/brain/02aa97d0-d278-4ccb-a40a-c9a9d9e64acc/screenshots/mobile_chat_scope_open_375px.png' });
    console.log('Saved mobile_chat_scope_open_375px.png');
  }

  await browser.close();
})();
