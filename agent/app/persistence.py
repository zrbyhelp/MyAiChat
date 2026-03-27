from __future__ import annotations

import json
import os
from pathlib import Path

from sqlalchemy import Column, MetaData, String, Table, Text, create_engine, inspect, select, text
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.dialects.mysql import insert as mysql_insert

from .schemas import ThreadState


class ThreadStore:
    def __init__(self) -> None:
        self.mode = "mysql" if os.getenv("AGENT_STORAGE_DRIVER", "file") == "mysql" else "file"
        self.file_dir = Path(os.getenv("AGENT_FILE_STORE_DIR", "/tmp/myaichat-agent"))
        self.engine = None
        self.table = None
        self._ready = False

    def ensure_ready(self) -> None:
        if self._ready:
            return
        if self.mode == "mysql":
            large_text = Text().with_variant(LONGTEXT(), "mysql")
            password = os.getenv("DB_PASSWORD", "myaichat")
            user = os.getenv("DB_USER", "myaichat")
            host = os.getenv("DB_HOST", "127.0.0.1")
            port = os.getenv("DB_PORT", "3306")
            name = os.getenv("DB_NAME", "myaichat")
            url = f"mysql+pymysql://{user}:{password}@{host}:{port}/{name}?charset=utf8mb4"
            self.engine = create_engine(url, pool_pre_ping=True)
            metadata = MetaData()
            self.table = Table(
                "agent_threads",
                metadata,
                Column("thread_id", String(160), primary_key=True),
                Column("messages_json", large_text, nullable=False),
                Column("memory_schema_json", large_text, nullable=False),
                Column("structured_memory_json", large_text, nullable=False),
                Column("numeric_state_json", large_text, nullable=False),
            )
            metadata.create_all(self.engine)
            inspector = inspect(self.engine)
            columns = {column["name"] for column in inspector.get_columns("agent_threads")}
            if "memory_schema_json" not in columns:
                with self.engine.begin() as conn:
                    conn.execute(text("ALTER TABLE agent_threads ADD COLUMN memory_schema_json TEXT NOT NULL"))
                    conn.execute(text("UPDATE agent_threads SET memory_schema_json='{\"categories\":[]}' WHERE memory_schema_json IS NULL OR memory_schema_json = ''"))
            if "numeric_state_json" not in columns:
                with self.engine.begin() as conn:
                    conn.execute(text("ALTER TABLE agent_threads ADD COLUMN numeric_state_json TEXT NOT NULL"))
                    conn.execute(text("UPDATE agent_threads SET numeric_state_json='{}' WHERE numeric_state_json IS NULL OR numeric_state_json = ''"))
            with self.engine.begin() as conn:
                conn.execute(text("ALTER TABLE agent_threads MODIFY COLUMN messages_json LONGTEXT NOT NULL"))
                conn.execute(text("ALTER TABLE agent_threads MODIFY COLUMN memory_schema_json LONGTEXT NOT NULL"))
                conn.execute(text("ALTER TABLE agent_threads MODIFY COLUMN structured_memory_json LONGTEXT NOT NULL"))
                conn.execute(text("ALTER TABLE agent_threads MODIFY COLUMN numeric_state_json LONGTEXT NOT NULL"))
        else:
            self.file_dir.mkdir(parents=True, exist_ok=True)
        self._ready = True

    def load(self, thread_id: str) -> ThreadState | None:
        self.ensure_ready()
        if self.mode == "mysql":
            assert self.engine is not None and self.table is not None
            with self.engine.begin() as conn:
                row = conn.execute(
                    select(
                        self.table.c.thread_id,
                        self.table.c.messages_json,
                        self.table.c.memory_schema_json,
                        self.table.c.structured_memory_json,
                        self.table.c.numeric_state_json,
                    ).where(self.table.c.thread_id == thread_id)
                ).mappings().first()
            if not row:
                return None
            return ThreadState.model_validate(
                {
                    "thread_id": row["thread_id"],
                    "messages": json.loads(row["messages_json"] or "[]"),
                    "memory_schema": json.loads(row["memory_schema_json"] or "{}"),
                    "structured_memory": json.loads(row["structured_memory_json"] or "{}"),
                    "numeric_state": json.loads(row["numeric_state_json"] or "{}"),
                }
            )

        file_path = self.file_dir / f"{thread_id}.json"
        if not file_path.exists():
            return None
        payload = json.loads(file_path.read_text(encoding="utf-8"))
        return ThreadState.model_validate(payload)

    def save(self, state: ThreadState) -> None:
        self.ensure_ready()
        state_payload = state.model_dump()
        if self.mode == "mysql":
            assert self.engine is not None and self.table is not None
            payload = {
                "thread_id": state.thread_id,
                "messages_json": json.dumps(state_payload["messages"], ensure_ascii=False),
                "memory_schema_json": json.dumps(state_payload["memory_schema"], ensure_ascii=False),
                "structured_memory_json": json.dumps(state_payload["structured_memory"], ensure_ascii=False),
                "numeric_state_json": json.dumps(state_payload["numeric_state"], ensure_ascii=False),
            }
            stmt = mysql_insert(self.table).values(**payload)
            with self.engine.begin() as conn:
                conn.execute(
                    stmt.on_duplicate_key_update(
                        messages_json=stmt.inserted.messages_json,
                        memory_schema_json=stmt.inserted.memory_schema_json,
                        structured_memory_json=stmt.inserted.structured_memory_json,
                        numeric_state_json=stmt.inserted.numeric_state_json,
                    )
                )
            return

        file_path = self.file_dir / f"{state.thread_id}.json"
        file_path.write_text(
            json.dumps(state_payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
