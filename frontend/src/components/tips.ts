/** Stable ids for contextual onboarding tips (see <Tip/> + TipsContext). */
export const TIP = {
  dashboardKbd: "dashboard-kbd",
  chatScope: "chat-scope",
  documentsUpload: "documents-upload",
  flashcardsStudy: "flashcards-study",
  quizStudy: "quiz-study",
  analyticsTopics: "analytics-topics",
  notesCreate: "notes-create",
  profileTheme: "profile-theme",
} as const;

export type TipId = (typeof TIP)[keyof typeof TIP];
