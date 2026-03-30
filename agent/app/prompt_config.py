from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class PromptDefaults(BaseModel):
    common_prompt: str = ""
    system_prompt: str = ""
    numeric_computation_prompt: str = ""


class AnswererPromptTemplate(BaseModel):
    base_instruction: str
    numeric_guardrail: str


class MemoryPatchPromptTemplate(BaseModel):
    system_instruction: str


class NumericAgentPromptTemplate(BaseModel):
    system_instruction: str
    user_prompt_label: str = "用户配置的数值计算提示词："


class UiAgentPromptTemplate(BaseModel):
    system_instruction: str


class WorldGraphContextPromptTemplate(BaseModel):
    system_instruction: str


class WorldGraphWritebackPromptTemplate(BaseModel):
    system_instruction: str


class PromptTemplates(BaseModel):
    answerer: AnswererPromptTemplate
    memory_patch: MemoryPatchPromptTemplate = Field(alias="memory_patch")
    numeric_agent: NumericAgentPromptTemplate = Field(alias="numeric_agent")
    ui_agent: UiAgentPromptTemplate = Field(alias="ui_agent")
    world_graph_context: WorldGraphContextPromptTemplate = Field(alias="world_graph_context")
    world_graph_writeback: WorldGraphWritebackPromptTemplate = Field(alias="world_graph_writeback")


class PromptConfig(BaseModel):
    defaults: PromptDefaults = Field(default_factory=PromptDefaults)
    templates: PromptTemplates


PROMPT_CONFIG_PATH = Path(__file__).with_name("prompts.yaml")


@lru_cache(maxsize=1)
def get_prompt_config() -> PromptConfig:
    try:
        raw = yaml.safe_load(PROMPT_CONFIG_PATH.read_text(encoding="utf-8")) or {}
    except FileNotFoundError as error:
        raise RuntimeError(f"Prompt config file not found: {PROMPT_CONFIG_PATH}") from error
    except yaml.YAMLError as error:
        raise RuntimeError(f"Prompt config YAML is invalid: {PROMPT_CONFIG_PATH}") from error
    return PromptConfig.model_validate(raw)
