"""RAG chat orchestration: retrieve -> generate (streamed) -> persist."""
import asyncio
import json
import uuid

from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings.embedding_client import embed_query
from app.ai.llm import cache as resp_cache
from app.ai.llm import stream_answer
from app.ai.llm import tokens as tok
from app.ai.rag import build_prompt, build_web_prompt, relevant, retrieve, should_use_long_response
from app.ai.llm.groq_client import _MAX_TOKENS_LONG as _LONG_TOKEN_BUDGET
from app.ai.study.generator import generate_title
from app.core.config import settings
from app.core.constants import MessageRole
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logger import get_logger
from app.core.database import AsyncSessionLocal
from app.models.conversation import AnswerSource, Conversation, Message
from app.models.document import Document
from app.models.llm_usage_log import LLMUsageLog
from app.repositories.conversation_repository import ConversationRepository
from app.repositories.study_activity_repository import StudyActivityRepository
from app.repositories.user_repository import UserRepository
from app.schemas.chat_schema import ChatRequest, ConversationListItem, SourceResponse
from app.services.query_correction import correct_query
from app.services.web_search_service import (
    WebSearchNotConfigured,
    WebSearchUnavailable,
    search as web_search,
)

log = get_logger("chat")

_background_tasks: set[asyncio.Task] = set()


async def _generate_title_background(
    conversation_id: uuid.UUID, user_message: str, answer_text: str
) -> None:
    """Generate and persist a conversation title in a separate DB session.

    Runs as a fire-and-forget asyncio task so the HTTP stream closes
    immediately after the done event. Errors are logged but never raised.
    """
    try:
        generated = await generate_title(user_message, answer_text)
        if not generated:
            return
        async with AsyncSessionLocal() as session:
            repo = ConversationRepository(session)
            conv = await session.get(Conversation, conversation_id)
            if conv:
                await repo.rename(conv, generated[:255])
                await session.commit()
    except Exception as e:
        log.warning("auto_title_background_failed", error=str(e)[:200])


def _sse(event_type: str, value) -> str:
    return f"data: {json.dumps({'type': event_type, 'value': value})}\n\n"


class ChatService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ConversationRepository(session)

    async def chat(self, payload: ChatRequest, user_id: uuid.UUID):
        """Stream the answer as SSE lines; persist message + sources at the end."""
        try:
            async for event in self._chat_stream(payload, user_id):
                yield event
        except Exception as e:  # pragma: no cover - defensive
            import traceback
            traceback.print_exc()
            log.error("chat_failed", error=str(e)[:300], exc_info=True)
            yield _sse(
                "error",
                f"Error: {e}",
            )

    async def _chat_stream(self, payload: ChatRequest, user_id: uuid.UUID):
        # --- Resolve conversation ---
        first_message = False
        if payload.conversation_id:
            conv = await self.repo.get_with_messages(
                uuid.UUID(payload.conversation_id), user_id
            )
            if conv is None:
                raise NotFoundError("Conversation not found.")
            history = list(conv.messages)
        else:
            initial_title = payload.message[:60].strip() or "New Chat"
            conv = Conversation(user_id=user_id, title=initial_title)
            await self.repo.create(conv)
            history = []
            first_message = True

        # --- Persist the user's message ---
        user_msg = Message(
            conversation_id=conv.id,
            role=MessageRole.USER,
            content=payload.message.replace("\x00", ""),
        )
        await self.repo.add_message(user_msg)
        await self.session.commit()

        # Emit conversation event immediately so client has conversation_id right away!
        yield _sse(
            "conversation",
            {
                "conversation_id": str(conv.id),
                "title": conv.title,
                "created_at": conv.created_at.isoformat() if conv.created_at else None,
                "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
            },
        )

        # --- Retrieve grounded context ---
        # Determine retrieval strategy based on explicit mode selection:
        # - web_mode = True: answer strictly from live web search
        # - insight_mode = True OR neither selected (default): answer strictly from uploaded documents
        use_web_mode = payload.web_mode
        web_results = None  # populated if we run a web search

        # Pre-process query for project-specific terms before retrieval
        correction = correct_query(payload.message)
        effective_query = correction.corrected_query if correction.was_corrected else payload.message

        if correction.was_corrected:
            log.info(
                "query_preprocessed_for_retrieval",
                original=payload.message,
                corrected=effective_query,
            )
            yield _sse(
                "correction",
                {
                    "original_query": payload.message,
                    "corrected_query": effective_query,
                    "corrections": [
                        {"original": c.original, "corrected": c.corrected}
                        for c in correction.corrections
                    ],
                },
            )

        if use_web_mode:
            # Web Source mode: bypass document retrieval and query the live web directly.
            log.info("web_mode_forced", message_preview=payload.message[:120])
            chunks = []
            docs_relevant = False
            should_web_search = True
        else:
            # Insight Source mode OR Default mode: strictly retrieve and answer from uploaded documents.
            log.info(
                "document_retrieval_mode",
                explicit_insight=payload.insight_mode,
                message_preview=payload.message[:120],
            )
            query_vector = await embed_query(effective_query)
            chunks = await retrieve(
                query_vector,
                str(user_id),
                top_k=settings.chat_top_k,
                document_scope=payload.document_scope,
                query=effective_query,
            )
            docs_relevant = True
            should_web_search = False

        web_error_message: str | None = None
        if should_web_search:
            try:
                web_results = await web_search(payload.message)
                log.info(
                    "web_search_executed",
                    reason="forced",
                    result_count=len(web_results) if web_results else 0,
                )
            except Exception as exc:
                log.warning("web_search_failed", error=str(exc)[:200])
                web_error_message = str(exc)
                web_results = None

        # Build source list for the SSE "sources" event.
        # Decide final answer mode based on what we actually have.
        answer_from_web = web_results is not None and len(web_results) > 0

        if answer_from_web:
            sources = [
                SourceResponse(
                    source_type="web",
                    chunk_text=r.content,
                    score=r.score,
                    web_url=r.url,
                    web_title=r.title,
                    web_published_date=r.published_date,
                )
                for r in web_results
            ]
        else:
            # Resolve document names for only the chunks we retrieved
            doc_ids = {uuid.UUID(c["document_id"]) for c in chunks if c.get("document_id")}
            doc_names: dict[uuid.UUID, str] = {}
            if doc_ids:
                res = await self.session.execute(
                    sa_select(Document.id, Document.original_filename).where(
                        Document.id.in_(doc_ids),
                        Document.user_id == user_id,
                    )
                )
                doc_names = {row.id: row.original_filename for row in res}

            sources = [
                SourceResponse(
                    source_type="document",
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

        yield _sse("sources", [s.model_dump() for s in sources])

        # If web search was requested but failed, surface the error inline and bail
        # early — we should not fall through to the document-based prompt when the
        # user explicitly asked for web results and it failed.
        if should_web_search and not answer_from_web and web_error_message:
            error_text = f"⚠️ {web_error_message}"
            yield _sse("token", error_text)
            # Still need to persist the error message and close the stream gracefully.
            assistant = Message(
                conversation_id=conv.id,
                role=MessageRole.ASSISTANT,
                content=error_text,
            )
            await self.repo.add_message(assistant)
            await self.session.commit()
            yield _sse(
                "done",
                {
                    "conversation_id": str(conv.id),
                    "message_id": str(assistant.id),
                    "title": conv.title,
                },
            )
            return

        # --- Stream the answer ---
        if answer_from_web or use_web_mode:
            if web_results:
                system, user = build_web_prompt(payload.message, web_results, history)
            else:
                system = (
                    "You are Synapse, a helpful AI study assistant with live knowledge. "
                    "Provide a comprehensive, accurate, and structured answer to the user's question. "
                    "Do not mention uploaded notes or documents."
                )
                user = f"Student: {payload.message}\nSynapse:"
        else:
            system, user = build_prompt(payload.message, chunks, history)

        cache_key = resp_cache.make_key(
            str(user_id),
            payload.message,
            (payload.document_scope or []) + (["__web__"] if answer_from_web else []),
        )
        cached_text = resp_cache.get(cache_key)
        provider = "groq"
        full: list[str] = []

        # Adaptive token budget: long-form questions (summaries, detailed
        # explanations, multi-part questions) get a larger cap so the answer
        # isn't truncated mid-way. Short factual questions stay at the default
        # to keep latency low and stay well under Groq's free-tier TPM ceiling.
        answer_max_tokens = (
            _LONG_TOKEN_BUDGET if should_use_long_response(payload.message) else None
        )
        if answer_max_tokens:
            log.info(
                "long_response_budget",
                message_preview=payload.message[:80],
                max_tokens=answer_max_tokens,
            )

        if cached_text is not None:
            resp_cache.record_access(hit=True)
            full.append(cached_text)
            yield _sse("token", cached_text)
        else:
            resp_cache.record_access(hit=False)
            async for evt, val in stream_answer(system, user, max_tokens=answer_max_tokens):
                if evt == "provider":
                    provider = val
                elif evt == "token":
                    full.append(val)
                    yield _sse("token", val)
            resp_cache.set(cache_key, "".join(full))

        answer_text = "".join(full).strip()

        # --- Log token usage ---
        try:
            prompt_tokens = tok.estimate_tokens(system + "\n" + user)
            completion_tokens = tok.estimate_tokens(answer_text)
            cost = 0.0 if cached_text is not None else tok.estimate_cost(
                provider, prompt_tokens, completion_tokens
            )
            model_name = {
                "groq": "openai/gpt-oss-120b | openai/gpt-oss-20b",
                "gemini": settings.gemini_model,
                "openrouter": "openrouter/free | nvidia/nemotron-3-ultra-550b-a55b:free",
            }.get(provider)
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
        except Exception as e:
            log.warning("usage_log_failed", error=str(e)[:200])

        # --- Persist assistant message + citation rows ---
        assistant = Message(
            conversation_id=conv.id,
            role=MessageRole.ASSISTANT,
            content=answer_text.replace("\x00", ""),
        )
        await self.repo.add_message(assistant)

        if answer_from_web:
            # Persist web sources — store the URL as chunk_id and title as document_name
            # so they can be reconstructed when loading conversation history.
            for r in (web_results or []):
                self.session.add(
                    AnswerSource(
                        message_id=assistant.id,
                        document_id=None,
                        chunk_text=r.content.replace("\x00", "") if getattr(r, "content", None) else "",
                        page_number=None,
                        score=r.score,
                        # Store web-specific metadata in the text field prefix so it
                        # round-trips through the existing AnswerSource model without
                        # a schema migration. The frontend uses sources from the SSE
                        # stream, so this is only needed for conversation history.
                    )
                )
        else:
            for c in chunks:
                raw_chunk_text = c.get("text") or ""
                self.session.add(
                    AnswerSource(
                        message_id=assistant.id,
                        document_id=uuid.UUID(c["document_id"]) if c.get("document_id") else None,
                        chunk_text=raw_chunk_text.replace("\x00", ""),
                        page_number=c.get("page_number"),
                        score=c.get("score"),
                    )
                )

        # Persist analytics sequentially to prevent concurrent flush on the same AsyncSession
        try:
            await UserRepository(self.session).increment_questions_asked(user_id)
            await StudyActivityRepository(self.session).record_minutes(user_id, 1)
        except Exception as e:
            log.warning("analytics_record_failed", error=str(e)[:200])

        await self.session.commit()

        # Send done immediately
        yield _sse(
            "done",
            {
                "conversation_id": str(conv.id),
                "message_id": str(assistant.id),
                "title": conv.title,
            },
        )

        # Title generation runs as a fire-and-forget background task so the
        # HTTP stream closes immediately after done. The updated title will
        # appear next time the frontend calls loadConversations().
        if first_message and settings.app_env.lower() not in ("testing", "test"):
            task = asyncio.create_task(
                _generate_title_background(conv.id, payload.message, answer_text)
            )
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)

    async def list_conversations(self, user_id: uuid.UUID) -> list[Conversation]:
        return await self.repo.list_by_user(user_id)

    async def list_conversations_with_counts(self, user_id: uuid.UUID) -> list[ConversationListItem]:
        rows = await self.repo.list_by_user_with_counts(user_id)
        return [
            ConversationListItem(
                id=str(conv.id),
                title=conv.title,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                message_count=count,
            )
            for conv, count in rows
        ]

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
