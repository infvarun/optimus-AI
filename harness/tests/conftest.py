import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

MOCK_PORT = 11499


@pytest.fixture(scope="session")
def mock_llm():
    import mock_llm as m

    server = m.serve(MOCK_PORT, background=True)
    yield f"http://127.0.0.1:{MOCK_PORT}/v1"
    server.shutdown()


@pytest.fixture(scope="session")
def mock_env(mock_llm, tmp_path_factory):
    return {
        "LLM_PROVIDER_TYPE": "openai",
        "LLM_BASE_URL": mock_llm,
        "LLM_MODEL": "mock-1",
        "HARNESS_DATA_DIR": str(tmp_path_factory.mktemp("data")),
    }
