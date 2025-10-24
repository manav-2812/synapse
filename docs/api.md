# Synapse API Reference

> Generated from the live OpenAPI schema (`GET /api/openapi.json`, Synapse API v1.0.0). The interactive Swagger UI is at `/docs` on the running API.

**Base path:** `/api/v1`  -  **Auth:** `Authorization: Bearer <access_token>`

Errors use the uniform shape `{"error": {"message": str, "code": str}}`.

## Endpoint groups

- [auth](#auth) - 4 endpoint(s)
- [users](#users) - 3 endpoint(s)
- [folders](#folders) - 3 endpoint(s)
- [documents](#documents) - 6 endpoint(s)
- [chat](#chat) - 7 endpoint(s)
- [study](#study) - 16 endpoint(s)
- [analytics](#analytics) - 2 endpoint(s)
- [eval](#eval) - 2 endpoint(s)
- [health](#health) - 1 endpoint(s)

## auth

- **`POST`** `/api/v1/auth/signup` - Signup
    - body: `SignupRequest`
- **`POST`** `/api/v1/auth/login` - Login
    - body: `LoginRequest`
- **`POST`** `/api/v1/auth/refresh` - Refresh
    - body: `RefreshRequest`
- **`POST`** `/api/v1/auth/logout` - Logout
    - body: `LogoutRequest`

## users

- **`GET`** `/api/v1/users/me` - Get Me
- **`PATCH`** `/api/v1/users/me` - Update Me
    - body: `UserUpdateRequest`
- **`POST`** `/api/v1/users/me/avatar` - Upload Avatar
    - body: application/json

## folders

- **`GET`** `/api/v1/documents/folders` - List Folders
- **`POST`** `/api/v1/documents/folders` - Create Folder
    - body: `FolderCreateRequest`
- **`DELETE`** `/api/v1/documents/folders/{folder_id}` - Delete Folder

## documents

- **`POST`** `/api/v1/documents/upload` - Upload Document
    - body: application/json
- **`GET`** `/api/v1/documents` - List Documents
    - query `folder_id` ()
- **`GET`** `/api/v1/documents/{document_id}` - Get Document
- **`PATCH`** `/api/v1/documents/{document_id}` - Update Document
    - body: `DocumentUpdateRequest`
- **`DELETE`** `/api/v1/documents/{document_id}` - Delete Document
- **`GET`** `/api/v1/documents/{document_id}/status` - Get Status

## chat

- **`POST`** `/api/v1/chat/message` - Chat Message
    - body: `ChatRequest`
- **`GET`** `/api/v1/chat/conversations` - List Conversations
- **`GET`** `/api/v1/chat/conversations/{conversation_id}` - Get Conversation
- **`DELETE`** `/api/v1/chat/conversations/{conversation_id}` - Delete Conversation
- **`PATCH`** `/api/v1/chat/conversations/{conversation_id}` - Rename Conversation
    - body: `ConversationRenameRequest`
- **`DELETE`** `/api/v1/chat/conversations/{conversation_id}/messages/{message_id}` - Delete Message
- **`PATCH`** `/api/v1/chat/conversations/{conversation_id}/messages/{message_id}` - Update Message
    - body: `MessageUpdateRequest`

## study

- **`GET`** `/api/v1/study/notes` - List Notes
- **`POST`** `/api/v1/study/notes` - Generate Note
    - body: `GenerateNoteRequest`
- **`DELETE`** `/api/v1/study/notes/{note_id}` - Delete Note
- **`PATCH`** `/api/v1/study/notes/{note_id}` - Update Note
    - body: `NoteUpdateRequest`
- **`GET`** `/api/v1/study/quiz` - List Quizzes
- **`POST`** `/api/v1/study/quiz` - Generate Quiz
    - body: `GenerateQuizRequest`
- **`POST`** `/api/v1/study/quiz/submit` - Submit Quiz
    - body: `SubmitQuizRequest`
- **`GET`** `/api/v1/study/quiz/{quiz_id}` - Get Quiz
- **`DELETE`** `/api/v1/study/quiz/{quiz_id}` - Delete Quiz
- **`PATCH`** `/api/v1/study/quiz/{quiz_id}` - Update Quiz
    - body: `QuizUpdateRequest`
- **`GET`** `/api/v1/study/flashcards` - List Flashcards
- **`POST`** `/api/v1/study/flashcards` - Generate Flashcards
    - body: `GenerateFlashcardsRequest`
- **`GET`** `/api/v1/study/flashcards/due` - Due Flashcards
    - query `limit` (integer)
- **`POST`** `/api/v1/study/flashcards/{card_id}/review` - Review Flashcard
    - body: `ReviewFlashcardRequest`
- **`DELETE`** `/api/v1/study/flashcards/{card_id}` - Delete Flashcard
- **`PATCH`** `/api/v1/study/flashcards/{card_id}` - Update Flashcard
    - body: `FlashcardUpdateRequest`

## analytics

- **`GET`** `/api/v1/analytics/dashboard` - Dashboard
- **`GET`** `/api/v1/analytics/usage` - Usage
    - query `days` (integer)

## eval

- **`POST`** `/api/v1/eval/run` - Run Eval
- **`GET`** `/api/v1/eval/runs` - List Runs

## health

- **`GET`** `/health` - Health
