"""RAG chat orchestration: retrieve -> generate (streamed) -> persist."""
import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings.embedding_client import embed_query
from app.ai.llm import cache as resp_cache
from app.ai.llm import stream_answer
from app.ai.llm import tokens as tok
from app.ai.rag import build_prompt, retrieve
from app.core.config import settings
from app.core.constants import MessageRole
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logger import get_logger
from app.models.conversation import AnswerSource, Conversation, Message
from app.models.llm_usage_log import LLMUsageLog
from app.repositories.conversation_repository import ConversationRepository
from app.repositories.document_repository import DocumentRepository
from app.repositories.study_activity_repository import StudyActivityRepository
from app.repositories.user_repository import UserRepository
from app.schemas.chat_schema import ChatRequest, SourceResponse

log = get_logger("chat")
TOP_K = 5


def _sse(event_type: str, value) -> str:
    return f"data: {json.dumps({'type': event_type, 'value': value})}\n\n"


class ChatService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ConversationRepository(session)

    async def chat(self, payload: ChatRequest, user_id: uuid.UUID):
        """Stream the answer as SSE lines; persist message + sources at the end.

        Any failure during streaming (retrieval error, provider outage, persist
        error) is caught and surfaced as a single ``error`` SSE event so the
        client can show a message instead of a silently truncated stream.
        """
        try:
            async for event in self._chat_stream(payload, user_id):
                yield event
        except Exception as e:  # pragma: no cover - defensive
            log.error("chat_failed", error=str(e)[:300], exc_info=True)
            yield _sse(
                "error",
                "Something went wrong while generating the response. Please try again.",
            )

    async def _chat_stream(self, payload: ChatRequest, user_id: uuid.UUID):
        # --- Resolve conversation (must belong to user) ---
        first_message = False
        if payload.conversation_id:
            conv = await self.repo.get_with_messages(
                uuid.UUID(payload.conversation_id), user_id
            )
            if conv is None:
                raise NotFoundError("Conversation not found.")
            history = list(conv.messages)
        else:
            conv = Conversation(user_id=user_id, title="New Chat")
            await self.repo.create(conv)
            history = []
            first_message = True

        # --- Persist the user's message ---
        user_msg = Message(
            conversation_id=conv.id,
            role=MessageRole.USER,
            content=payload.message,
        )
        await self.repo.add_message(user_msg)
        await self.session.flush()

        if first_message:
            conv.title = payload.message[:60].strip() or "New Chat"
            await self.repo.rename(conv, conv.title)

        # --- Retrieve grounded context ---
        query_vector = await embed_query(payload.message)
        chunks = await retrieve(
            query_vector,
            str(user_id),
            top_k=TOP_K,
            document_scope=payload.document_scope,
            query=payload.message,
        )

        # Resolve document names once for all chunks (for citation chips).
        doc_ids = {uuid.UUID(c["document_id"]) for c in chunks if c.get("document_id")}
        doc_names: dict[uuid.UUID, str] = {}
        if doc_ids:
            owned = await DocumentRepository(self.session).list_by_user(user_id)
            doc_names = {d.id: d.original_filename for d in owned if d.id in doc_ids}

        sources = [
            SourceResponse(
                document_id=str(c["document_id"]) if c.get("document_id") else None,
                document_name=doc_names.get(uuid.UUID(c["document_id"]))
                if c.get("document_id")
                else None,
                chunk_id=c.get("chunk_id"),
                chunk_text=c["text"],
                page_number=c.get("page_number"),
                score=c.get("score"),
            )
            for c in chunks
        ]

        # --- Emit retrieved sources first so the UI can render citations ---
        yield _sse("sources", [s.model_dump() for s in sources])

        # --- Stream the answer (with response cache + usage logging) ---
        system, user = build_prompt(payload.message, chunks, history)

        cache_key = resp_cache.make_key(
            str(user_id), payload.message, payload.document_scope
        )
        cached_text = resp_cache.get(cache_key)
        provider = "groq"
        full: list[str] = []

        if cached_text is not None:
            resp_cache.record_access(hit=True)
            full.append(cached_text)
            yield _sse("token", cached_text)
        else:
            resp_cache.record_access(hit=False)
            async for evt, val in stream_answer(system, user):
                if evt == "provider":
                    provider = val
                elif evt == "token":
                    full.append(val)
                    yield _sse("token", val)
            answer_full = "".join(full)
            resp_cache.set(cache_key, answer_full)

        answer_text = "".join(full).strip()

        # Log token usage + estimated cost (cache hit still logged, cost ~0).
        try:
            prompt_tokens = tok.estimate_tokens(system + "\n" + user)
            completion_tokens = tok.estimate_tokens(answer_text)
            cost = 0.0 if cached_text is not None else tok.estimate_cost(
                provider, prompt_tokens, completion_tokens
            )
            model_name = "llama-3.3-70b-versatile" if provider == "groq" else "gemini-2.5-flash"
            self.session.add(
                LLMUsageLog(
                    user_id=user_id,
                    provider=provider,
                    model=model_name,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=prompt_tokens + completion_tokens,
                    estimated_cost=cost,
                    cached=cached_text is not None,
                )
            )
        except Exception as e:  # usage logging must never break the response
            log.warning("usage_log_failed", error=str(e)[:200])

        # --- Persist assistant message + citation rows ---
        assistant = Message(
            conversation_id=conv.id,
            role=MessageRole.ASSISTANT,
            content=answer_text,
        )
        await self.repo.add_message(assistant)
        for c in chunks:
            self.session.add(
                AnswerSource(
                    message_id=assistant.id,
                    document_id=uuid.UUID(c["document_id"]) if c.get("document_id") else None,
                    chunk_text=c["text"],
                    page_number=c.get("page_number"),
                    score=c.get("score"),
                )
            )

        await UserRepository(self.session).increment_questions_asked(user_id)
        # A chat question counts as light study activity (~1 minute).
        await StudyActivityRepository(self.session).record_minutes(user_id, 1)
        await self.session.commit()

        yield _sse(
            "done",
            {
                "conversation_id": str(conv.id),
                "message_id": str(assistant.id),
                "title": conv.title,
            },
        )

    async def list_conversations(self, user_id: uuid.UUID) -> list[Conversation]:
        convs = await self.repo.list_by_user(user_id)
        return convs

    async def get_conversation(self, conversation_id: uuid.UUID, user_id: uuid.UUID):
        conv = await self.repo.get_with_messages(conversation_id, user_id)
        if conv is None:
            raise NotFoundError("Conversation not found.")
        return conv

    async def delete_conversation(self, conversation_id: uuid.UUID, user_id: uuid.UUID) -> None:
        conv = await self.repo.get_owned(conversation_id, user_id)
        if conv is None:
            raise NotFoundError("Conversation not found.")
        await self.repo.delete(conv)
        await self.session.commit()

    async def rename_conversation(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, title: str
    ) -> Conversation:
        conv = await self.repo.get_owned(conversation_id, user_id)
        if conv is None:
            raise NotFoundError("Conversation not found.")
        title = (title or "").strip()
        if not title:
            raise ValidationError("Conversation title cannot be empty.")
        await self.repo.rename(conv, title[:255])
        await self.session.commit()
        await self.session.refresh(conv)
        return conv

    async def delete_message(
        self, conversation_id: uuid.UUID, message_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        conv = await self.repo.get_owned(conversation_id, user_id)
        if conv is None:
            raise NotFoundError("Conversation not found.")
        msg = await self.repo.get_message(message_id, conversation_id)
        if msg is None:
            raise NotFoundError("Message not found.")
        await self.repo.delete_message(msg)
        await self.session.commit()

    async def update_message(
        self,
        conversation_id: uuid.UUID,
        message_id: uuid.UUID,
        user_id: uuid.UUID,
        content: str,
    ) -> Message:
        conv = await self.repo.get_owned(conversation_id, user_id)
        if conv is None:
            raise NotFoundError("Conversation not found.")
        msg = await self.repo.get_message(message_id, conversation_id)
        if msg is None:
            raise NotFoundError("Message not found.")
        content = (content or "").strip()
        if not content:
            raise ValidationError("Message content cannot be empty.")
        return await self.repo.update_message(msg, content[:20000])
