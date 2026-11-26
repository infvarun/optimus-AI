import pytest

from optimus_harness.config import ConfigError, load_config


def test_refuses_to_start_without_provider():
    with pytest.raises(ConfigError, match="LLM_PROVIDER_TYPE"):
        load_config({})


def test_ollama_alias_maps_to_openai_compatible_localhost():
    c = load_config({"LLM_PROVIDER_TYPE": "ollama", "LLM_MODEL": "qwen3:8b"})
    assert c.provider == {"name": "byok", "type": "openai", "base_url": "http://localhost:11434/v1"}
    assert c.provider_label == "ollama"


def test_azure_requires_base_url_and_passes_api_version():
    with pytest.raises(ConfigError, match="LLM_BASE_URL"):
        load_config({"LLM_PROVIDER_TYPE": "azure", "LLM_MODEL": "gpt"})
    c = load_config({
        "LLM_PROVIDER_TYPE": "azure", "LLM_MODEL": "gpt", "LLM_BASE_URL": "https://x.openai.azure.com",
        "LLM_API_KEY": "k", "AZURE_OPENAI_API_VERSION": "2024-10-21",
    })
    assert c.provider["type"] == "azure" and c.provider["api_key"] == "k"
    assert c.provider["azure"] == {"api_version": "2024-10-21"}
