from __future__ import annotations

import asyncio
import os
import tempfile
import unittest
from pathlib import Path

import httpx

from app import graph, main
from app.graph import build_initial_state, normalize_structured_memory, refresh_state_memory_context
from app.persistence import ThreadStore
from app.schemas import ChatMessage, GeneratedMemorySchemaPayload, RunRequest, StructuredMemory, ThreadState


class FakeMessage:
    def __init__(self, content, input_tokens: int = 0, output_tokens: int = 0):
        self.content = content
        self.usage_metadata = {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }
        self.tool_calls = []
        self.additional_kwargs = {}
        self.invalid_tool_calls = []


class FakeModel:
    def __init__(self, kind: str):
        self.kind = kind

    async def ainvoke(self, messages):
        if self.kind == "numeric":
            return FakeMessage('{"hp": 10}', 11, 7)
        if self.kind == "memory":
            return FakeMessage('{"updated_at":"2026-03-27T00:00:00Z","categories":[]}', 17, 6)
        if self.kind == "world_graph":
            return FakeMessage('{"upsert_nodes":[],"upsert_edges":[],"upsert_events":[]}', 13, 5)
        return FakeMessage("stub-final", 19, 9)

    async def astream(self, messages):
        yield FakeMessage("stub-")
        yield FakeMessage("final", 19, 9)


def fake_build_model(config):
    name = config.get("model")
    if name == "numeric-model":
        return FakeModel("numeric")
    if name == "memory-model":
        return FakeModel("memory")
    if name == "graph-model":
        return FakeModel("world_graph")
    return FakeModel("answer")


class BuildInitialStateTests(unittest.TestCase):
    def test_build_initial_state_caches_context_and_normalizes_numeric_items(self):
        request = RunRequest.model_validate(
            {
                "thread_id": "thread-1",
                "session_id": "session-1",
                "prompt": "hi",
                "user": {"id": "u1"},
                "model_config": {
                    "provider": "openai",
                    "base_url": "http://example.com",
                    "api_key": "test-key",
                    "model": "answer-model",
                    "temperature": 0.7,
                },
                "robot": {
                    "numeric_computation_items": [
                        {"name": "hp", "current_value": 8, "description": "生命值"},
                    ]
                },
                "memory_schema": {"categories": []},
                "structured_memory": {"updated_at": "", "categories": []},
                "history": [{"role": "user", "content": "old"}],
                "auxiliary_model_configs": {},
                "numeric_state": {},
            }
        )
        history = [ChatMessage(role="user", content="old")]
        structured_memory = normalize_structured_memory(
            request.memory_schema,
            request.structured_memory.model_dump(),
        )

        state = build_initial_state(request, history, request.memory_schema, structured_memory)

        self.assertEqual(state["history_text"], "user: old")
        self.assertEqual(state["structured_memory_text"], "暂无结构化记忆。")
        self.assertIn('"categories": []', state["structured_memory_payload_json"])
        self.assertEqual(
            state["numeric_computation_items"],
            [{"name": "hp", "current_value": 8.0, "description": "生命值"}],
        )

    def test_refresh_state_memory_context_updates_cached_fields(self):
        request = RunRequest.model_validate(
            {
                "thread_id": "thread-2",
                "session_id": "session-2",
                "prompt": "hi",
                "user": {"id": "u1"},
                "model_config": {
                    "provider": "openai",
                    "base_url": "http://example.com",
                    "api_key": "test-key",
                    "model": "answer-model",
                    "temperature": 0.7,
                },
                "memory_schema": {"categories": []},
                "structured_memory": {"updated_at": "", "categories": []},
                "history": [],
                "auxiliary_model_configs": {},
                "numeric_state": {},
            }
        )
        state = build_initial_state(
            request,
            [],
            request.memory_schema,
            normalize_structured_memory(request.memory_schema, request.structured_memory.model_dump()),
        )

        refresh_state_memory_context(
            state,
            StructuredMemory.model_validate({"updated_at": "new", "categories": []}),
        )

        self.assertEqual(state["structured_memory"].updated_at, "new")
        self.assertIn('"updated_at": "new"', state["structured_memory_payload_json"])


class JsonParsingTests(unittest.TestCase):
    def test_parse_json_object_extracts_object_from_wrapped_text(self):
        parsed = graph.parse_json_object(
            """当然，下面是结果：

```json
{"name":"测试智能体","description":"测试简介"}
```
""",
            {},
        )

        self.assertEqual(
            parsed,
            {
                "name": "测试智能体",
                "description": "测试简介",
            },
        )

    def test_coerce_structured_payload_from_raw_recovers_invalid_tool_arguments(self):
        raw = FakeMessage("")
        raw.additional_kwargs = {
            "tool_calls": [
                {
                    "function": {
                        "arguments": '{"categories":[{"id":"character","label":"角色","description":"角色信息","extractionInstructions":"","fields":[{"id":"name","name":"name","label":"名称","type":"text","required":true,"options":[]}]}]} trailing'
                    }
                }
            ]
        }

        parsed = main.coerce_structured_payload_from_raw(GeneratedMemorySchemaPayload, raw)

        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.categories[0].id, "character")


class ThreadStoreTests(unittest.TestCase):
    def test_file_store_round_trip_and_lazy_init(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_driver = os.environ.get("AGENT_STORAGE_DRIVER")
            previous_dir = os.environ.get("AGENT_FILE_STORE_DIR")
            try:
                os.environ["AGENT_STORAGE_DRIVER"] = "file"
                os.environ["AGENT_FILE_STORE_DIR"] = temp_dir
                store = ThreadStore()
                self.assertFalse(store._ready)

                state = ThreadState.model_validate(
                    {
                        "thread_id": "thread-store-test",
                        "messages": [{"role": "user", "content": "hello"}],
                        "memory_schema": {"categories": []},
                        "structured_memory": {"updated_at": "", "categories": []},
                        "numeric_state": {"hp": 1},
                    }
                )
                store.save(state)
                loaded = store.load("thread-store-test")

                self.assertTrue(store._ready)
                self.assertIsNotNone(loaded)
                assert loaded is not None
                self.assertEqual(loaded.thread_id, "thread-store-test")
                self.assertEqual(loaded.numeric_state, {"hp": 1})
                self.assertTrue((Path(temp_dir) / "thread-store-test.json").exists())
            finally:
                if previous_driver is None:
                    os.environ.pop("AGENT_STORAGE_DRIVER", None)
                else:
                    os.environ["AGENT_STORAGE_DRIVER"] = previous_driver
                if previous_dir is None:
                    os.environ.pop("AGENT_FILE_STORE_DIR", None)
                else:
                    os.environ["AGENT_FILE_STORE_DIR"] = previous_dir


class RunStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_runs_stream_completes_with_stubbed_models(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_dir = os.environ.get("AGENT_FILE_STORE_DIR")
            original_graph_build_model = graph.build_model
            original_main_build_model = main.build_model
            original_store = main.store
            try:
                os.environ["AGENT_FILE_STORE_DIR"] = temp_dir
                graph.build_model = fake_build_model
                main.build_model = fake_build_model
                main.store = ThreadStore()
                main.store.ensure_ready()

                transport = httpx.ASGITransport(app=main.app)
                async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                    response = await client.post(
                        "/runs/stream",
                        json={
                            "thread_id": "thread-run-test",
                            "session_id": "session-run-test",
                            "prompt": "测试",
                            "user": {"id": "u1"},
                            "model_config": {
                                "provider": "openai",
                                "base_url": "http://example.com",
                                "api_key": "test-key",
                                "model": "answer-model",
                                "temperature": 0.7,
                            },
                            "robot": {
                                "common_prompt": "通用前缀",
                                "system_prompt": "角色设定",
                                "numeric_computation_enabled": True,
                                "numeric_computation_prompt": "保持 hp=10",
                                "numeric_computation_items": [
                                    {"name": "hp", "current_value": 8, "description": "生命值"}
                                ],
                            },
                            "auxiliary_model_configs": {
                                "memory": {
                                    "provider": "openai",
                                    "base_url": "http://example.com",
                                    "api_key": "test-key",
                                    "model": "memory-model",
                                    "temperature": 0.7,
                                },
                                "numeric_computation": {
                                    "provider": "openai",
                                    "base_url": "http://example.com",
                                    "api_key": "test-key",
                                    "model": "numeric-model",
                                    "temperature": 0.7,
                                },
                            },
                            "memory_schema": {"categories": []},
                            "structured_memory": {"updated_at": "", "categories": []},
                            "history": [{"role": "user", "content": "old"}],
                            "numeric_state": {},
                            "structured_memory_interval": 1,
                        },
                    )

                self.assertEqual(response.status_code, 200)
                self.assertIn("run_started", response.text)
                self.assertIn("numeric_state_updated", response.text)
                self.assertIn("message_done", response.text)
                self.assertIn("response_completed", response.text)
                self.assertIn("run_completed", response.text)
                self.assertIn('"hp": 10.0', response.text)
            finally:
                graph.build_model = original_graph_build_model
                main.build_model = original_main_build_model
                main.store = original_store
                if previous_dir is None:
                    os.environ.pop("AGENT_FILE_STORE_DIR", None)
                else:
                    os.environ["AGENT_FILE_STORE_DIR"] = previous_dir

    async def test_runs_stream_does_not_emit_world_graph_writeback_events(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_dir = os.environ.get("AGENT_FILE_STORE_DIR")
            original_graph_build_model = graph.build_model
            original_main_build_model = main.build_model
            original_store = main.store
            try:
                os.environ["AGENT_FILE_STORE_DIR"] = temp_dir
                graph.build_model = fake_build_model
                main.build_model = fake_build_model
                main.store = ThreadStore()
                main.store.ensure_ready()

                transport = httpx.ASGITransport(app=main.app)
                async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                    response = await client.post(
                        "/runs/stream",
                        json={
                            "thread_id": "thread-world-graph-test",
                            "session_id": "session-world-graph-test",
                            "prompt": "测试世界图谱状态",
                            "user": {"id": "u1"},
                            "model_config": {
                                "provider": "openai",
                                "base_url": "http://example.com",
                                "api_key": "test-key",
                                "model": "answer-model",
                                "temperature": 0.7,
                            },
                            "robot": {
                                "common_prompt": "通用前缀",
                                "system_prompt": "角色设定",
                            },
                            "auxiliary_model_configs": {},
                            "memory_schema": {"categories": []},
                            "structured_memory": {"updated_at": "", "categories": []},
                            "history": [{"role": "user", "content": "old"}],
                            "numeric_state": {},
                            "world_graph": {
                                "meta": {"robotId": "robot-1", "robotName": "测试智能体"},
                                "nodes": [],
                                "edges": [],
                                "events": [],
                            },
                        },
                    )

                self.assertEqual(response.status_code, 200)
                self.assertNotIn("world_graph_writeback_started", response.text)
                self.assertNotIn("world_graph_writeback_ready", response.text)
            finally:
                graph.build_model = original_graph_build_model
                main.build_model = original_main_build_model
                main.store = original_store
                if previous_dir is None:
                    os.environ.pop("AGENT_FILE_STORE_DIR", None)
                else:
                    os.environ["AGENT_FILE_STORE_DIR"] = previous_dir

    async def test_runs_memory_updates_thread_store(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_dir = os.environ.get("AGENT_FILE_STORE_DIR")
            original_graph_build_model = graph.build_model
            original_main_build_model = main.build_model
            original_store = main.store
            try:
                os.environ["AGENT_FILE_STORE_DIR"] = temp_dir
                graph.build_model = fake_build_model
                main.build_model = fake_build_model
                main.store = ThreadStore()
                main.store.ensure_ready()

                main.store.save(
                    ThreadState.model_validate(
                        {
                            "thread_id": "thread-memory-job",
                            "messages": [
                                {"role": "user", "content": "old"},
                                {"role": "assistant", "content": "old-answer"},
                            ],
                            "memory_schema": {"categories": []},
                            "structured_memory": {"updated_at": "", "categories": []},
                            "numeric_state": {"hp": 1},
                            "story_outline": "old-outline",
                        }
                    )
                )

                transport = httpx.ASGITransport(app=main.app)
                async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                    response = await client.post(
                        "/runs/memory",
                        json={
                            "thread_id": "thread-memory-job",
                            "session_id": "session-memory-job",
                            "prompt": "测试",
                            "final_response": "最终回复",
                            "user": {"id": "u1"},
                            "model_config": {
                                "provider": "openai",
                                "base_url": "http://example.com",
                                "api_key": "test-key",
                                "model": "answer-model",
                                "temperature": 0.7,
                            },
                            "robot": {
                                "memory_model_config_id": "memory-config",
                            },
                            "auxiliary_model_configs": {
                                "memory": {
                                    "provider": "openai",
                                    "base_url": "http://example.com",
                                    "api_key": "test-key",
                                    "model": "memory-model",
                                    "temperature": 0.7,
                                }
                            },
                            "memory_schema": {"categories": []},
                            "structured_memory": {"updated_at": "", "categories": []},
                            "history": [{"role": "user", "content": "old"}],
                            "numeric_state": {},
                        },
                    )

                self.assertEqual(response.status_code, 200)
                self.assertIn("memory", response.json())
                stored = main.store.load("thread-memory-job")
                self.assertIsNotNone(stored)
                assert stored is not None
                self.assertEqual(stored.structured_memory.updated_at, "2026-03-27T00:00:00Z")
                self.assertEqual(stored.story_outline, "old-outline")
            finally:
                graph.build_model = original_graph_build_model
                main.build_model = original_main_build_model
                main.store = original_store
                if previous_dir is None:
                    os.environ.pop("AGENT_FILE_STORE_DIR", None)
                else:
                    os.environ["AGENT_FILE_STORE_DIR"] = previous_dir

    async def test_runs_world_graph_writeback_returns_ops(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_dir = os.environ.get("AGENT_FILE_STORE_DIR")
            original_graph_build_model = graph.build_model
            original_main_build_model = main.build_model
            original_store = main.store
            try:
                os.environ["AGENT_FILE_STORE_DIR"] = temp_dir
                graph.build_model = fake_build_model
                main.build_model = fake_build_model
                main.store = ThreadStore()
                main.store.ensure_ready()

                transport = httpx.ASGITransport(app=main.app)
                async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                    response = await client.post(
                        "/runs/world-graph-writeback",
                        json={
                            "thread_id": "thread-graph-job",
                            "session_id": "session-graph-job",
                            "prompt": "测试",
                            "final_response": "最终回复",
                            "user": {"id": "u1"},
                            "model_config": {
                                "provider": "openai",
                                "base_url": "http://example.com",
                                "api_key": "test-key",
                                "model": "answer-model",
                                "temperature": 0.7,
                            },
                            "robot": {
                                "world_graph_model_config_id": "graph-config",
                            },
                            "auxiliary_model_configs": {
                                "world_graph": {
                                    "provider": "openai",
                                    "base_url": "http://example.com",
                                    "api_key": "test-key",
                                    "model": "graph-model",
                                    "temperature": 0.7,
                                }
                            },
                            "memory_schema": {"categories": []},
                            "structured_memory": {"updated_at": "", "categories": []},
                            "history": [{"role": "user", "content": "old"}],
                            "numeric_state": {},
                            "world_graph": {
                                "meta": {"robotId": "robot-1", "robotName": "测试智能体"},
                                "nodes": [],
                                "edges": [],
                                "events": [],
                            },
                        },
                    )

                self.assertEqual(response.status_code, 200)
                self.assertEqual(
                    response.json()["world_graph_writeback_ops"],
                    {"upsert_nodes": [], "upsert_edges": [], "upsert_events": [], "append_node_snapshots": [], "append_edge_snapshots": [], "append_event_effects": []},
                )
            finally:
                graph.build_model = original_graph_build_model
                main.build_model = original_main_build_model
                main.store = original_store
                if previous_dir is None:
                    os.environ.pop("AGENT_FILE_STORE_DIR", None)
                else:
                    os.environ["AGENT_FILE_STORE_DIR"] = previous_dir


class CapturingModel:
    def __init__(self, response_content: str):
        self.response_content = response_content
        self.messages = None

    async def ainvoke(self, messages):
        self.messages = messages
        return FakeMessage(self.response_content, 5, 3)


class WorldGraphPromptPlacementTests(unittest.IsolatedAsyncioTestCase):
    async def test_build_answerer_messages_puts_story_setting_in_system_message_and_graph_in_user_message(self):
        state = {
            "common_prompt": "通用前缀",
            "system_prompt": "角色设定",
            "story_outline": "剧情先推进误会，再让角色给出回应。",
            "structured_memory_text": "暂无结构化记忆。",
            "numeric_computation_items": [],
            "numeric_state": {},
            "history_text": "user: old",
            "prompt": "继续推进剧情",
            "world_graph_payload": {"meta": {"robotId": "robot-1"}, "nodes": [], "edges": [], "events": []},
        }

        messages = graph.build_answerer_messages(state)

        self.assertEqual(messages[0]["role"], "system")
        self.assertIn("通用前缀", messages[0]["content"])
        self.assertIn("角色设定", messages[0]["content"])
        self.assertIn("角色沉浸感", messages[0]["content"])
        self.assertIn("内部故事梗概只用于你规划本轮推进", messages[0]["content"])
        self.assertIn("suggestions", messages[0]["content"])
        self.assertIn("必须返回 form，而不是 suggestions", messages[0]["content"])
        self.assertIn("不取决于用户之前是否已经主动说过什么", messages[0]["content"])
        self.assertEqual(messages[1]["role"], "user")
        self.assertIn("内部故事梗概", messages[1]["content"])
        self.assertIn("剧情先推进误会", messages[1]["content"])
        self.assertIn("完整世界图谱 JSON", messages[1]["content"])
        self.assertIn('"robotId": "robot-1"', messages[1]["content"])

    async def test_story_outline_node_puts_story_setting_in_system_message(self):
        original_build_model = graph.build_model
        model = CapturingModel("先描述误会升级，再安排角色正面回应。")
        try:
            graph.build_model = lambda config: model
            state = {
                "common_prompt": "通用前缀",
                "system_prompt": "角色设定",
                "structured_memory_text": "暂无结构化记忆。",
                "numeric_computation_items": [],
                "numeric_state": {},
                "history_text": "user: old",
                "prompt": "继续推进剧情",
                "world_graph_payload": {"meta": {"robotId": "robot-1"}, "nodes": [], "edges": [], "events": []},
                "model_config": {"model": "answer-model"},
                "auxiliary_model_configs": {},
            }

            payload = await graph.story_outline_node(state)

            self.assertEqual(payload["story_outline"], "先描述误会升级，再安排角色正面回应。")
            self.assertIsNotNone(model.messages)
            self.assertEqual(model.messages[0]["role"], "system")
            self.assertIn("通用前缀", model.messages[0]["content"])
            self.assertIn("主要故事设定：\n角色设定", model.messages[0]["content"])
            self.assertEqual(model.messages[1]["role"], "user")
            self.assertIn("完整世界图谱 JSON", model.messages[1]["content"])
        finally:
            graph.build_model = original_build_model

    async def test_world_graph_writeback_puts_story_setting_in_system_message(self):
        original_build_model = graph.build_model
        model = CapturingModel('{"upsert_nodes":[],"upsert_edges":[],"upsert_events":[]}')
        try:
            graph.build_model = lambda config: model
            state = {
                "common_prompt": "通用前缀",
                "system_prompt": "角色设定",
                "structured_memory_text": "暂无结构化记忆。",
                "numeric_computation_items": [],
                "numeric_state": {},
                "story_outline": "剧情先推进误会，再让角色给出回应。",
                "history_text": "user: old",
                "prompt": "继续推进剧情",
                "world_graph_payload": {"meta": {"robotId": "robot-1"}, "nodes": [], "edges": [], "events": []},
                "final_response": "最终正文",
                "model_config": {"model": "answer-model"},
                "auxiliary_model_configs": {},
            }

            await graph.world_graph_writeback_node(state)

            self.assertIsNotNone(model.messages)
            self.assertEqual(model.messages[0]["role"], "system")
            self.assertIn("通用前缀", model.messages[0]["content"])
            self.assertIn("主要故事设定：\n角色设定", model.messages[0]["content"])
            self.assertEqual(model.messages[1]["role"], "user")
            self.assertNotIn("主要故事设定：", model.messages[1]["content"])
        finally:
            graph.build_model = original_build_model


class RobotGenerationTests(unittest.IsolatedAsyncioTestCase):
    async def test_robot_generation_rejects_incomplete_payload(self):
        original_invoke_structured_model = main.invoke_structured_model
        try:
            async def fake_invoke_structured_model(config, system_instruction, user_content, schema, stage_label):
                if stage_label == "智能体核心配置":
                    return schema.model_validate({
                        "name": "",
                        "description": "",
                        "systemPrompt": "",
                        "commonPrompt": "",
                        "numericComputationEnabled": False,
                        "numericComputationPrompt": "",
                        "numericComputationItems": [],
                        "structuredMemoryInterval": 3,
                        "structuredMemoryHistoryLimit": 12,
                        "documentSummary": "",
                        "retrievalSummary": "",
                    }), {"prompt_tokens": 1, "completion_tokens": 1}
                if stage_label == "结构化记忆 schema":
                    return schema.model_validate({
                        "categories": [
                            {
                                "id": "character",
                                "label": "角色",
                                "description": "角色信息",
                                "extractionInstructions": "",
                                "fields": [
                                    {"id": "name", "name": "name", "label": "名称", "type": "text", "required": True, "options": []}
                                ],
                            }
                        ]
                    }), {"prompt_tokens": 1, "completion_tokens": 1}
                raise AssertionError(stage_label)

            main.invoke_structured_model = fake_invoke_structured_model

            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                response = await client.post(
                    "/runs/robot-generation",
                    json={
                        "model_config": {
                            "provider": "openai",
                            "base_url": "http://example.com",
                            "api_key": "test-key",
                            "model": "answer-model",
                            "temperature": 0.7,
                        },
                        "source_name": "测试文档.txt",
                        "guidance": "生成一个角色扮演智能体",
                        "document_summary": "这是一份关于架空世界观与角色设定的文档摘要。",
                        "segment_summaries": ["角色设定", "世界规则"],
                    },
                )

            self.assertEqual(response.status_code, 502)
            self.assertIn("生成的智能体配置不完整", response.text)
            self.assertIn("name", response.text)
        finally:
            main.invoke_structured_model = original_invoke_structured_model

    async def test_robot_generation_merges_core_and_memory_outputs(self):
        original_invoke_structured_model = main.invoke_structured_model
        try:
            async def fake_invoke_structured_model(config, system_instruction, user_content, schema, stage_label):
                if stage_label == "智能体核心配置":
                    return schema.model_validate({
                        "name": "盗墓搭档",
                        "description": "陪伴用户探索盗墓世界设定的智能体。",
                        "systemPrompt": "你是熟悉盗墓笔记世界观的中文叙事助手。",
                        "commonPrompt": "",
                        "numericComputationEnabled": False,
                        "numericComputationPrompt": "",
                        "numericComputationItems": [],
                        "structuredMemoryInterval": 3,
                        "structuredMemoryHistoryLimit": 12,
                        "documentSummary": "盗墓题材文档摘要",
                        "retrievalSummary": "盗墓、吴邪、张起灵、古墓线索",
                    }), {"prompt_tokens": 5, "completion_tokens": 3}
                if stage_label == "结构化记忆 schema":
                    return schema.model_validate({
                        "categories": [
                            {
                                "id": "character",
                                "label": "角色",
                                "description": "角色信息",
                                "extractionInstructions": "提取关键角色。",
                                "fields": [
                                    {"id": "name", "name": "name", "label": "名称", "type": "text", "required": True, "options": []}
                                ],
                            },
                            {
                                "id": "clue",
                                "label": "线索",
                                "description": "线索信息",
                                "extractionInstructions": "提取关键线索。",
                                "fields": [
                                    {"id": "detail", "name": "detail", "label": "细节", "type": "text", "required": True, "options": []}
                                ],
                            },
                        ]
                    }), {"prompt_tokens": 7, "completion_tokens": 4}
                raise AssertionError(stage_label)

            main.invoke_structured_model = fake_invoke_structured_model

            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                response = await client.post(
                    "/runs/robot-generation",
                    json={
                        "model_config": {
                            "provider": "openai",
                            "base_url": "http://example.com",
                            "api_key": "test-key",
                            "model": "answer-model",
                            "temperature": 0.7,
                        },
                        "source_name": "测试文档.txt",
                        "guidance": "生成一个角色扮演智能体",
                        "document_summary": "这是一份关于架空世界观与角色设定的文档摘要。",
                        "segment_summaries": ["角色设定", "世界规则"],
                    },
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["name"], "盗墓搭档")
            self.assertEqual(response.json()["document_summary"], "盗墓题材文档摘要")
            self.assertEqual(len(response.json()["memory_schema"]["categories"]), 2)
            self.assertEqual(response.json()["usage"]["prompt_tokens"], 12)
            self.assertEqual(response.json()["world_graph"], {})
        finally:
            main.invoke_structured_model = original_invoke_structured_model

    async def test_robot_world_graph_evolution_returns_patch(self):
        original_invoke_structured_model = main.invoke_structured_model
        try:
            async def fake_invoke_structured_model(config, system_instruction, user_content, schema, stage_label):
                if stage_label == "世界图谱演化 patch":
                    return schema.model_validate({
                        "meta": {"title": "盗墓世界图谱", "description": "增量演化后摘要"},
                        "upsertRelationTypes": [
                            {"id": "companion", "name": "同伴", "description": "同行关系", "directionality": "undirected"}
                        ],
                        "deleteRelationTypeCodes": ["obsolete-relation"],
                        "upsertNodes": [
                            {"id": "wu-xie", "name": "吴邪", "type": "character", "description": "主角"},
                        ],
                        "deleteNodeIds": ["old-node"],
                        "upsertEdges": [
                            {"id": "edge-1", "source": "wu-xie", "target": "zhang-qi-ling", "relationType": "companion", "description": "共同探墓"},
                        ],
                        "deleteEdgeIds": ["old-edge"],
                    }), {"prompt_tokens": 6, "completion_tokens": 2}
                raise AssertionError(stage_label)

            main.invoke_structured_model = fake_invoke_structured_model

            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                response = await client.post(
                    "/runs/robot-world-graph-evolution",
                    json={
                        "model_config": {
                            "provider": "openai",
                            "base_url": "http://example.com",
                            "api_key": "test-key",
                            "model": "answer-model",
                            "temperature": 0.7,
                        },
                        "source_name": "测试文档.txt",
                        "guidance": "生成一个角色扮演智能体",
                        "core": {
                            "name": "盗墓搭档",
                            "description": "陪伴用户探索盗墓世界设定的智能体。",
                        },
                        "segment_summary": "本段明确吴邪与张起灵是稳定搭档。",
                        "segment_index": 1,
                        "segment_total": 4,
                        "current_world_graph": {
                            "meta": {"title": "旧图谱", "summary": ""},
                            "relationTypes": [],
                            "nodes": [{"id": "zhang-qi-ling", "name": "张起灵", "objectType": "character", "summary": "关键同伴"}],
                            "edges": [],
                        },
                    },
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["world_graph_patch"]["meta"]["title"], "盗墓世界图谱")
            self.assertEqual(response.json()["world_graph_patch"]["delete_relation_type_codes"], ["obsolete-relation"])
            self.assertEqual(response.json()["world_graph_patch"]["delete_node_ids"], ["old-node"])
            self.assertEqual(response.json()["world_graph_patch"]["delete_edge_ids"], ["old-edge"])
            self.assertEqual(response.json()["world_graph_patch"]["upsert_nodes"][0]["id"], "wu-xie")
            self.assertEqual(response.json()["usage"]["prompt_tokens"], 6)
        finally:
            main.invoke_structured_model = original_invoke_structured_model

    async def test_robot_world_graph_evolution_rejects_empty_summary(self):
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post(
                "/runs/robot-world-graph-evolution",
                json={
                    "model_config": {
                        "provider": "openai",
                        "base_url": "http://example.com",
                        "api_key": "test-key",
                        "model": "answer-model",
                        "temperature": 0.7,
                    },
                    "segment_summary": "   ",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("segment_summary 不能为空", response.text)

    async def test_robot_world_graph_evolution_bubbles_up_agent_failures_without_fallback(self):
        original_invoke_structured_model = main.invoke_structured_model
        try:
            async def fake_invoke_structured_model(config, system_instruction, user_content, schema, stage_label):
                raise main.HTTPException(status_code=502, detail="世界图谱演化 patch生成失败：provider error")

            main.invoke_structured_model = fake_invoke_structured_model

            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                response = await client.post(
                    "/runs/robot-world-graph-evolution",
                    json={
                        "model_config": {
                            "provider": "openai",
                            "base_url": "http://example.com",
                            "api_key": "test-key",
                            "model": "answer-model",
                            "temperature": 0.7,
                        },
                        "segment_summary": "吴邪和张起灵关系明确。",
                    },
                )

            self.assertEqual(response.status_code, 502)
            self.assertIn("provider error", response.text)
        finally:
            main.invoke_structured_model = original_invoke_structured_model


if __name__ == "__main__":
    unittest.main()
