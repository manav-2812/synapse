"""Alembic environment (sync engine for migrations)."""
from logging.config import fileConfig

from alembic import context
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import Base
import app.models  # noqa: F401  (register all models on Base.metadata)

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with connection.begin():
        context.run_migrations()


def run_migrations_online() -> None:
    # Alembic inspects the connection synchronously; use a sync engine for
    # migrations while the app itself uses asyncpg.
    sync_url = settings.database_url.replace("+asyncpg", "+psycopg2")
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = sync_url
    from sqlalchemy import engine_from_config

    connectable = engine_from_config(
        configuration, prefix="sqlalchemy.", poolclass=NullPool
    )
    with connectable.connect() as connection:
        do_run_migrations(connection)
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
