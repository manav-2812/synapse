import { request } from "./client";
import type {
  FlashcardResponse,
  FlashcardUpdateRequest,
  GenerateFlashcardsRequest,
  GenerateNoteRequest,
  GenerateQuizRequest,
  NoteResponse,
  NoteUpdateRequest,
  QuizResponse,
  QuizResultResponse,
  QuizUpdateRequest,
  ReviewFlashcardRequest,
  SubmitQuizRequest,
} from "../types/api";

export const studyApi = {
  createNote(
    noteType: GenerateNoteRequest["note_type"],
    documentScope?: string[] | null,
  ): Promise<NoteResponse> {
    return request<NoteResponse>("/study/notes", {
      method: "POST",
      body: { note_type: noteType, document_scope: documentScope || null },
    });
  },
  listNotes(): Promise<NoteResponse[]> {
    return request<NoteResponse[]>("/study/notes");
  },
  deleteNote(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/study/notes/${id}`, { method: "DELETE" });
  },
  updateNote(id: string, payload: NoteUpdateRequest): Promise<NoteResponse> {
    return request<NoteResponse>(`/study/notes/${id}`, { method: "PATCH", body: payload });
  },

  generateQuiz(
    difficulty?: GenerateQuizRequest["difficulty"],
    questionCount?: number,
    documentScope?: string[] | null,
  ): Promise<QuizResponse> {
    return request<QuizResponse>("/study/quiz", {
      method: "POST",
      body: {
        difficulty,
        question_count: questionCount,
        document_scope: documentScope || null,
      },
    });
  },
  submitQuiz(quizId: string, answers: string[]): Promise<QuizResultResponse> {
    const payload: SubmitQuizRequest = { quiz_id: quizId, answers };
    return request<QuizResultResponse>("/study/quiz/submit", {
      method: "POST",
      body: payload,
    });
  },
  listQuizzes(): Promise<QuizResponse[]> {
    return request<QuizResponse[]>("/study/quiz");
  },
  getQuiz(id: string): Promise<QuizResponse> {
    return request<QuizResponse>(`/study/quiz/${id}`);
  },
  deleteQuiz(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/study/quiz/${id}`, { method: "DELETE" });
  },
  updateQuiz(id: string, payload: QuizUpdateRequest): Promise<QuizResponse> {
    return request<QuizResponse>(`/study/quiz/${id}`, { method: "PATCH", body: payload });
  },

  generateFlashcards(
    count?: number,
    documentScope?: string[] | null,
  ): Promise<FlashcardResponse[]> {
    const payload: GenerateFlashcardsRequest = {
      count,
      document_scope: documentScope || null,
    };
    return request<FlashcardResponse[]>("/study/flashcards", {
      method: "POST",
      body: payload,
    });
  },
  listFlashcards(): Promise<FlashcardResponse[]> {
    return request<FlashcardResponse[]>("/study/flashcards");
  },
  dueFlashcards(limit = 50): Promise<FlashcardResponse[]> {
    return request<FlashcardResponse[]>(`/study/flashcards/due?limit=${limit}`);
  },
  reviewFlashcard(id: string, quality: number): Promise<FlashcardResponse> {
    const payload: ReviewFlashcardRequest = { quality };
    return request<FlashcardResponse>(`/study/flashcards/${id}/review`, {
      method: "POST",
      body: payload,
    });
  },
  deleteFlashcard(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/study/flashcards/${id}`, {
      method: "DELETE",
    });
  },
  updateFlashcard(id: string, payload: FlashcardUpdateRequest): Promise<FlashcardResponse> {
    return request<FlashcardResponse>(`/study/flashcards/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },
};
