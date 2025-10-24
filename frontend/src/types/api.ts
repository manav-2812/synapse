// API response/request types — mirror the backend Pydantic schemas field-for-field.
// Keep these in sync with backend/app/schemas/*.py. No `any` for response shapes.

/* ---------------- Eval (retrieval evaluation dashboard) ---------------- */
export interface EvalRunItem {
  id: string;
  question: string;
  expected_answer: string;
  expected_documents: string[];
  retrieved_documents: string[];
  precision_at_k: number;
  recall_at_k: number;
  mrr: number;
  hit: boolean;
  skipped: boolean;
}
export interface EvalAggregate {
  precision_at_k: number;
  recall_at_k: number;
  mrr: number;
  n_evaluated: number;
  n_total: number;
  n_passed: number;
}
export interface RunEvalResponse {
  user_id: string;
  timestamp: string;
  k: number;
  results: EvalRunItem[];
  aggregate: EvalAggregate;
}
export interface EvalRunResponse {
  id: string;
  timestamp: string;
  aggregate_scores: EvalAggregate;
  raw_results: { timestamp: string; k: number; results: EvalRunItem[] };
}

/* ---------------- Auth ---------------- */
export interface SignupRequest {
  email: string;
  password: string;
  full_name: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type?: string;
}
export interface RefreshRequest {
  refresh_token: string;
}
export interface LogoutRequest {
  refresh_token?: string | null;
}

/* ---------------- User ---------------- */
export interface UserProfile {
  education_level: string | null;
  institution: string | null;
  preferences: Record<string, unknown>;
}
export interface UserMeResponse {
  id: string;
  email: string;
  full_name: string;
  profile_image_url: string | null;
  is_active: boolean;
  profile: UserProfile | null;
  daily_study_goal_minutes: number;
  created_at: string;
}
export interface UserUpdateRequest {
  full_name?: string | null;
  profile_image_url?: string | null;
  education_level?: string | null;
  institution?: string | null;
  preferences?: Record<string, unknown> | null;
  daily_study_goal_minutes?: number | null;
  email?: string | null;
  current_password?: string | null;
  new_password?: string | null;
}
export type UserUpdateResponse = UserMeResponse;

/* ---------------- Documents & Folders ---------------- */
export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";
export type FileType = "pdf" | "docx" | "txt" | "image";

export interface DocumentResponse {
  id: string;
  user_id: string;
  folder_id: string | null;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  processing_status: string;
  page_count: number | null;
  error_message: string | null;
  created_at: string;
}
export interface DocumentStatusResponse {
  id: string;
  processing_status: string;
  page_count: number | null;
  error_message: string | null;
  chunk_count: number;
}
export interface DocumentUpdateRequest {
  folder_id?: string | null;
  original_filename?: string | null;
}
export interface FolderResponse {
  id: string;
  user_id: string;
  name: string;
  parent_folder_id: string | null;
  created_at: string;
}
export interface FolderCreateRequest {
  name: string;
  parent_folder_id?: string | null;
}

/* ---------------- Chat ---------------- */
export interface ChatRequest {
  message: string;
  conversation_id?: string | null;
  document_scope?: string[] | null;
}
export interface SourceResponse {
  document_id: string | null;
  document_name: string | null;
  chunk_id: string | null;
  chunk_text: string;
  page_number: number | null;
  score: number | null;
}
export interface MessageResponse {
  id: string;
  role: string;
  content: string;
  created_at: string;
  sources: SourceResponse[];
}
export interface ConversationListItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}
export interface ConversationDetail {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: MessageResponse[];
}
export interface ChatDonePayload {
  conversation_id: string;
  message_id: string;
  title: string;
}
export interface ConversationRenameRequest {
  title: string;
}
export interface MessageUpdateRequest {
  content: string;
}
export type ChatStreamEvent =
  | { type: "sources"; value: SourceResponse[] }
  | { type: "token"; value: string }
  | { type: "done"; value: ChatDonePayload | null };

/* ---------------- Study tools ---------------- */
export type NoteType = "short_notes" | "long_notes" | "exam_answer" | "formula_sheet";
export type Difficulty = "easy" | "medium" | "hard";
export type QuestionType = "mcq" | "short_answer";

export interface GenerateNoteRequest {
  note_type: NoteType;
  document_scope?: string[] | null;
}
export interface GenerateQuizRequest {
  difficulty?: Difficulty;
  question_count?: number;
  document_scope?: string[] | null;
}
export interface GenerateFlashcardsRequest {
  count?: number;
  document_scope?: string[] | null;
}
export interface SubmitQuizRequest {
  quiz_id: string;
  answers: string[];
}
export interface NoteResponse {
  id: string;
  note_type: string;
  title: string;
  content: string;
  document_scope: string[] | null;
  created_at: string;
}
export interface QuestionResponse {
  id: string;
  question_type: string;
  prompt: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
}
export interface QuizResponse {
  id: string;
  title: string;
  difficulty: string;
  document_scope: string[] | null;
  questions: QuestionResponse[];
  created_at: string;
}
export interface QuizResultItem {
  question_id: string;
  prompt: string;
  chosen: string | null;
  correct_answer: string;
  correct: boolean;
  explanation: string | null;
}
export interface QuizResultResponse {
  quiz_id: string;
  total: number;
  correct: number;
  score: number;
  items: QuizResultItem[];
}
export interface FlashcardResponse {
  id: string;
  document_id: string | null;
  front: string;
  back: string;
  created_at: string;
  // SM-2 scheduling state.
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_date: string | null;
  last_reviewed_at: string | null;
  is_due: boolean;
}
export interface ReviewFlashcardRequest {
  quality: number;
}
export interface NoteUpdateRequest {
  title?: string | null;
  content?: string | null;
}
export interface QuizUpdateRequest {
  title?: string | null;
}
export interface FlashcardUpdateRequest {
  front?: string | null;
  back?: string | null;
}

/* ---------------- Analytics ---------------- */
export interface AnalyticsSummary {
  documents_uploaded_count: number;
  questions_asked_count: number;
  quizzes_taken_count: number;
  average_quiz_score: number;
  total_study_minutes: number;
  study_streak: number;
  today_study_minutes: number;
  weekly_study_minutes: number;
  daily_study_goal_minutes: number;
}
export interface DocumentItem {
  id: string;
  name: string;
  status: string;
  chunk_count: number;
  created_at: string;
}
export interface QuizItem {
  id: string;
  title: string;
  difficulty: string;
  score: number | null;
  created_at: string;
}
export interface TopicPerformance {
  topic: string;
  score: number;
  quizzes: number;
}
/* One bar of the weekly activity chart (Mon–Sun of the current week). */
export interface DayMinutes {
  date: string;
  weekday: string;
  minutes: number;
}
/* Weekly chart data + the week-over-week totals for the trend badge. */
export interface WeeklyActivity {
  by_day: DayMinutes[];
  this_week_minutes: number;
  last_week_minutes: number;
}
/* A metric's value this calendar week vs the previous one (null = no data). */
export interface MetricTrend {
  this_week: number | null;
  last_week: number | null;
}
export interface MetricTrends {
  documents: MetricTrend;
  questions: MetricTrend;
  quizzes: MetricTrend;
  /* avg_score carries percentage points (0–100) when a week has scored quizzes. */
  avg_score: MetricTrend;
}
export interface DashboardResponse {
  summary: AnalyticsSummary;
  weekly_activity: WeeklyActivity;
  metric_trends: MetricTrends;
  weak_topics: string[];
  strong_topics: string[];
  recent_documents: DocumentItem[];
  recent_quizzes: QuizItem[];
  topic_performance: TopicPerformance[];
}

/* ---------------- Usage & cost ---------------- */
export interface UsageDay {
  date: string;
  requests: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost: number;
  cache_hits: number;
}
export interface UsageResponse {
  requests: number;
  total_tokens: number;
  total_cost: number;
  cache_hit_rate: number;
  per_day: UsageDay[];
}
