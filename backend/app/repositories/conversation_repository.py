"""Conversation + message repository — all queries scoped by user_id."""
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation, Message


class ConversationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, conversation: Conversation) -> Conversation:
        self.session.add(conversation)
        await self.session.flush()
        return conversation

    async def list_by_user(self, user_id: UUID) -> list[Conversation]:
        res = await self.session.execute(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc())
        )
        return list(res.scalars().all())

    async def get_owned(self, conversation_id: UUID, user_id: UUID) -> Conversation | None:
        res = await self.session.execute(
            select(Conversation)
            .where(Conversation.id == conversation_id, Conversation.user_id == user_id)
        )
        return res.scalar_one_or_none()

    async def get_with_messages(self, conversation_id: UUID, user_id: UUID) -> Conversation | None:
        res = await self.session.execute(
            select(Conversation)
            .options(
                selectinload(Conversation.messages).selectinload(Message.sources)
            )
            .where(Conversation.id == conversation_id, Conversation.user_id == user_id)
        )
        return res.scalar_one_or_none()

    async def add_message(self, message: Message) -> Message:
        self.session.add(message)
        await self.session.flush()
        return message

    async def rename(self, conversation: Conversation, title: str) -> Conversation:
        conversation.title = title
        await self.session.flush()
        return conversation

    async def delete(self, conversation: Conversation) -> None:
        # Cascade removes messages + sources.
        await self.session.delete(conversation)
        await self.session.flush()

    async def message_count(self, conversation_id: UUID) -> int:
        res = await self.session.execute(
            select(func.count())
            .select_from(Message)
            .where(Message.conversation_id == conversation_id)
        )
        return int(res.scalar() or 0)

    async def get_message(self, message_id: UUID, conversation_id: UUID) -> Message | None:
        """Fetch a message, scoped to a specific conversation (ownership)."""
        res = await self.session.execute(
            select(Message).where(
                Message.id == message_id, Message.conversation_id == conversation_id
            )
        )
        return res.scalar_one_or_none()

    async def update_message(self, message: Message, content: str) -> Message:
        message.content = content
        await self.session.flush()
        await self.session.refresh(message)
        return message

    async def delete_message(self, message: Message) -> None:
        await self.session.delete(message)
        await self.session.flush()
