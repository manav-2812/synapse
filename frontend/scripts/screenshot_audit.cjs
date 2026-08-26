const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.resolve('C:/Users/baghe/.gemini/antigravity-ide/brain/02aa97d0-d278-4ccb-a40a-c9a9d9e64acc/screenshots');

const VIEWPORTS = [
  { name: '375px', width: 375, height: 667 },
  { name: '390px', width: 390, height: 844 },
  { name: '414px', width: 414, height: 896 },
  { name: '768px', width: 768, height: 1024 },
  { name: '1440px', width: 1440, height: 900 },
];

const PAGES = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'chat', path: '/chat' },
  { name: 'documents', path: '/documents' },
  { name: 'notes', path: '/notes' },
  { name: 'flashcards', path: '/flashcards' },
  { name: 'quiz', path: '/quiz' },
  { name: 'eval', path: '/eval' },
  { name: 'analytics', path: '/analytics' },
];

const mockUser = {
  id: 'usr_test_123',
  email: 'alex@synapse.ai',
  full_name: 'Alex Mercer',
  profile_image_url: null,
  is_active: true,
  profile: {
    education_level: 'Undergraduate',
    institution: 'Stanford University',
    preferences: {}
  },
  daily_study_goal_minutes: 45,
  created_at: new Date().toISOString()
};

const mockDashboard = {
  summary: {
    documents_uploaded_count: 14,
    questions_asked_count: 42,
    quizzes_taken_count: 28,
    average_quiz_score: 87.5,
    total_study_minutes: 380,
    study_streak: 7,
    today_study_minutes: 45,
    weekly_study_minutes: 240,
    daily_study_goal_minutes: 45
  },
  weekly_activity: {
    by_day: [
      { date: '2026-08-20', weekday: 'Thu', minutes: 40 },
      { date: '2026-08-21', weekday: 'Fri', minutes: 55 },
      { date: '2026-08-22', weekday: 'Sat', minutes: 30 },
      { date: '2026-08-23', weekday: 'Sun', minutes: 45 },
      { date: '2026-08-24', weekday: 'Mon', minutes: 60 },
      { date: '2026-08-25', weekday: 'Tue', minutes: 50 },
      { date: '2026-08-26', weekday: 'Wed', minutes: 45 },
    ],
    this_week_minutes: 240,
    last_week_minutes: 210
  },
  metric_trends: {
    documents: { this_week: 14, last_week: 10 },
    questions: { this_week: 42, last_week: 30 },
    quizzes: { this_week: 28, last_week: 20 },
    avg_score: { this_week: 88, last_week: 82 }
  },
  weak_topics: ['Raft Consensus', 'Virtual Memory Paging'],
  strong_topics: ['Transformer Architecture', 'Scaled Dot-Product Attention', 'CAP Theorem'],
  recent_documents: [
    { id: 'doc_1', name: 'Neural Networks & Deep Learning.pdf', status: 'completed', chunk_count: 98, created_at: new Date().toISOString() },
    { id: 'doc_2', name: 'Distributed Systems Patterns.pdf', status: 'completed', chunk_count: 64, created_at: new Date(Date.now() - 86400000).toISOString() },
  ],
  recent_quizzes: [
    { id: 'quiz_1', title: 'Attention Mechanism & Transformers', difficulty: 'medium', score: 92, created_at: new Date().toISOString() },
    { id: 'quiz_2', title: 'Raft Consensus Protocol', difficulty: 'hard', score: 85, created_at: new Date(Date.now() - 86400000).toISOString() },
  ],
  topic_performance: [
    { topic: 'Deep Learning', score: 92, quizzes: 5 },
    { topic: 'Distributed Systems', score: 85, quizzes: 4 },
    { topic: 'Operating Systems', score: 78, quizzes: 3 }
  ]
};

const mockUsage = {
  requests: 142,
  total_tokens: 384500,
  total_cost: 0.48,
  cache_hit_rate: 0.68,
  per_day: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
    requests: Math.floor(Math.random() * 20) + 2,
    total_tokens: Math.floor(Math.random() * 25000) + 2000,
    prompt_tokens: 8000,
    completion_tokens: 4000,
    estimated_cost: 0.02,
    cache_hits: 5
  }))
};

const mockHeatmap = Array.from({ length: 90 }, (_, i) => ({
  date: new Date(Date.now() - (89 - i) * 86400000).toISOString().split('T')[0],
  count: Math.floor(Math.random() * 60)
}));

const mockDocuments = [
  {
    id: 'doc_1',
    user_id: 'usr_test_123',
    folder_id: null,
    filename: 'Neural_Networks_Deep_Learning.pdf',
    original_filename: 'Neural Networks & Deep Learning.pdf',
    file_type: 'pdf',
    file_size_bytes: 4280000,
    processing_status: 'completed',
    page_count: 42,
    chunk_count: 98,
    error_message: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'doc_2',
    user_id: 'usr_test_123',
    folder_id: null,
    filename: 'Distributed_Systems_Patterns.pdf',
    original_filename: 'Distributed Systems Architecture & Design Patterns.pdf',
    file_type: 'pdf',
    file_size_bytes: 2950000,
    processing_status: 'completed',
    page_count: 28,
    chunk_count: 64,
    error_message: null,
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'doc_3',
    user_id: 'usr_test_123',
    folder_id: null,
    filename: 'Modern_Operating_Systems.pdf',
    original_filename: 'Modern Operating Systems Principles.pdf',
    file_type: 'pdf',
    file_size_bytes: 5600000,
    processing_status: 'completed',
    page_count: 56,
    chunk_count: 120,
    error_message: null,
    created_at: new Date(Date.now() - 172800000).toISOString()
  }
];

const mockNotes = [
  {
    id: 'note_1',
    note_type: 'long_notes',
    title: 'Transformer Self-Attention Mechanics',
    content: '## Transformer Architecture\n\nSelf-attention allows the model to associate each word in the input with other words in the sequence...',
    document_scope: ['doc_1'],
    created_at: new Date().toISOString()
  },
  {
    id: 'note_2',
    note_type: 'short_notes',
    title: 'CAP Theorem & PACELC Trade-offs',
    content: '## Consistency Models\n\nIn a distributed computer system, you can only support two of the following guarantees...',
    document_scope: ['doc_2'],
    created_at: new Date(Date.now() - 86400000).toISOString()
  }
];

const mockFlashcards = [
  {
    id: 'card_1',
    document_id: 'doc_1',
    front: 'What is Query, Key, and Value in Self-Attention?',
    back: 'Q represents current token looking for context, K is token label representing features, V is token content aggregated by attention weights.',
    ease_factor: 2.5,
    interval_days: 3,
    repetitions: 4,
    due_date: new Date().toISOString(),
    last_reviewed_at: new Date().toISOString(),
    is_due: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'card_2',
    document_id: 'doc_2',
    front: 'What does Split-Brain mean in distributed clusters?',
    back: 'A condition where cluster nodes diverge into two sub-clusters, each believing it is the only active primary.',
    ease_factor: 2.3,
    interval_days: 1,
    repetitions: 2,
    due_date: new Date().toISOString(),
    last_reviewed_at: new Date().toISOString(),
    is_due: true,
    created_at: new Date().toISOString()
  }
];

const mockQuizzes = [
  {
    id: 'quiz_1',
    title: 'Attention Mechanism & Transformers',
    difficulty: 'medium',
    document_scope: ['doc_1'],
    created_at: new Date().toISOString(),
    questions: [
      {
        id: 'q1',
        question_type: 'mcq',
        prompt: 'Why is scaled dot-product attention divided by sqrt(d_k)?',
        options: [
          'To prevent dot products from growing large in high dimensions, which pushes softmax into regions with small gradients',
          'To reduce computational complexity of matrix multiplication from O(n^2) to O(n)',
          'To ensure all attention weights sum to 0 instead of 1',
          'To normalize vector norms to unit length'
        ],
        correct_answer: 'To prevent dot products from growing large in high dimensions, which pushes softmax into regions with small gradients',
        explanation: 'For large values of d_k, the dot products grow large in magnitude, pushing the softmax function into regions where it has extremely small gradients.'
      }
    ]
  }
];

const mockEvalRuns = [
  {
    id: 'run_1',
    timestamp: new Date().toISOString(),
    aggregate_scores: {
      precision_at_k: 0.92,
      recall_at_k: 0.96,
      mrr: 0.94,
      n_evaluated: 50,
      n_total: 50,
      n_passed: 48
    },
    raw_results: {
      timestamp: new Date().toISOString(),
      k: 5,
      results: [
        {
          id: 'eval_1',
          question: 'How does Multi-Head Attention differ from Single-Head Attention?',
          expected_answer: 'It projects queries, keys, and values h times with different learned linear projections.',
          expected_documents: ['doc_1'],
          source_document_name: 'Neural Networks & Deep Learning.pdf',
          retrieved_documents: ['doc_1'],
          precision_at_k: 1.0,
          recall_at_k: 1.0,
          mrr: 1.0,
          hit: true,
          skipped: false
        },
        {
          id: 'eval_2',
          question: 'What is vector clock synchronization in Dynamo?',
          expected_answer: 'A vector clock is a list of (node, counter) pairs used to capture causality between different versions of an object.',
          expected_documents: ['doc_2'],
          source_document_name: 'Distributed Systems Architecture.pdf',
          retrieved_documents: ['doc_2'],
          precision_at_k: 1.0,
          recall_at_k: 1.0,
          mrr: 1.0,
          hit: true,
          skipped: false
        }
      ]
    }
  }
];

async function main() {
  const prefix = process.argv[2] || 'before';
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Starting screenshot capture (mode: ${prefix})...`);
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    console.log(`\nCapturing viewport: ${vp.name} (${vp.width}x${vp.height})`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1
    });

    const page = await context.newPage();

    // Mock API requests
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/auth/me')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
      }
      if (url.includes('/analytics/dashboard')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDashboard) });
      }
      if (url.includes('/analytics/heatmap')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockHeatmap) });
      }
      if (url.includes('/analytics/usage')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUsage) });
      }
      if (url.includes('/documents/folders')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      if (url.includes('/documents')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDocuments) });
      }
      if (url.includes('/study/notes')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockNotes) });
      }
      if (url.includes('/study/flashcards')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFlashcards) });
      }
      if (url.includes('/study/quiz')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockQuizzes) });
      }
      if (url.includes('/eval/runs')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockEvalRuns) });
      }
      if (url.includes('/chat/conversations')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'conv_1',
              title: 'Attention Is All You Need Discussion',
              preview: 'Can you explain multi-head attention in detail?',
              updated_at: new Date().toISOString(),
              model: 'gemini-1.5-flash',
              scope: 'all'
            }
          ])
        });
      }
      if (url.includes('/chat/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'conv_1',
            title: 'Attention Is All You Need Discussion',
            messages: [
              {
                id: 'm1',
                role: 'user',
                content: 'Can you explain how multi-head attention works in the Transformer model?',
                created_at: new Date().toISOString()
              },
              {
                id: 'm2',
                role: 'assistant',
                content: 'Multi-head attention projects queries, keys, and values $h$ times with different learned linear projections to $d_k$, $d_k$, and $d_v$ dimensions respectively.\n\n$$\\text{MultiHead}(Q, K, V) = \\text{Concat}(\\text{head}_1, \\dots, \\text{head}_h)W^O$$\n\nWhere each head is computed as:\n$$\\text{head}_i = \\text{Attention}(QW_i^Q, KW_i^K, VW_i^V)$$',
                sources: [
                  { document_id: 'doc_1', filename: 'Neural Networks & Deep Learning.pdf', chunk_index: 4, text_snippet: 'Multi-head attention allows the model to jointly attend to information from different representation subspaces.' }
                ],
                created_at: new Date().toISOString()
              }
            ]
          })
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    // Set auth token in localStorage before navigating
    await page.goto('http://127.0.0.1:5173/login');
    await page.evaluate(() => {
      localStorage.setItem('synapse_access', 'mock_token_123');
      localStorage.setItem('synapse_refresh', 'mock_refresh_123');
      localStorage.setItem('synapse_persist', '1');
    });

    for (const p of PAGES) {
      try {
        await page.goto(`http://127.0.0.1:5173${p.path}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await page.waitForTimeout(800);

        const fileName = `${prefix}_${p.name}_${vp.name}.png`;
        const filePath = path.join(OUTPUT_DIR, fileName);
        await page.screenshot({ path: filePath, fullPage: false });
        console.log(`  ✓ Saved ${fileName}`);
      } catch (err) {
        console.error(`  ✗ Failed to capture ${p.name} at ${vp.name}:`, err.message);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log('\nScreenshot capture complete!');
}

main().catch(console.error);
