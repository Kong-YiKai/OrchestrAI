import pytest

from services.perception import PerceptionService, WebReadRequest, WebSearchRequest
from services.perception.contracts import WebReadResult, WebSearchResult
from services.perception.errors import ProviderRequestError, ProviderUnavailableError
from services.perception.service import build_perception_service
import services.perception.tracing as perception_tracing
import services.perception.service as perception_service_mod


class FakeSearchProvider:
    name = "fake-search"

    async def search(self, request: WebSearchRequest) -> list[WebSearchResult]:
        return [
            WebSearchResult(
                title="Result",
                url="https://example.com",
                snippet=request.query,
                provider=self.name,
            )
        ]


class FakeReadProvider:
    name = "fake-read"

    async def read(self, request: WebReadRequest) -> WebReadResult:
        return WebReadResult(
            url=str(request.url),
            title="Page",
            text="Body",
            markdown="Body",
            provider=self.name,
        )


class FailingSearchProvider:
    name = "failing-search"

    async def search(self, request: WebSearchRequest) -> list[WebSearchResult]:
        raise RuntimeError("search failed")


class FailingReadProvider:
    name = "failing-read"

    async def read(self, request: WebReadRequest) -> WebReadResult:
        raise RuntimeError("read failed")


def test_search_request_lists_are_not_shared():
    first = WebSearchRequest(query="first")
    second = WebSearchRequest(query="second")

    first.include_domains.append("example.com")

    assert second.include_domains == []


@pytest.mark.asyncio
async def test_search_uses_default_provider_for_auto_request():
    service = PerceptionService(
        search_providers={"fake": FakeSearchProvider()},
        default_search_provider="fake",
        trace_enabled=False,
    )

    response = await service.search(WebSearchRequest(query="phase 5.5"))

    assert response.provider == "fake-search"
    assert response.results[0].snippet == "phase 5.5"


@pytest.mark.asyncio
async def test_search_raises_when_provider_is_missing():
    service = PerceptionService(default_search_provider="missing", trace_enabled=False)

    with pytest.raises(ProviderUnavailableError) as exc:
        await service.search(WebSearchRequest(query="phase 5.5"))

    assert exc.value.operation == "search"
    assert exc.value.provider == "missing"


@pytest.mark.asyncio
async def test_read_uses_default_provider_for_auto_request():
    service = PerceptionService(
        read_providers={"fake": FakeReadProvider()},
        default_read_provider="fake",
        trace_enabled=False,
    )

    result = await service.read(WebReadRequest(url="https://example.com"))

    assert result.provider == "fake-read"
    assert result.markdown == "Body"


@pytest.mark.asyncio
async def test_read_default_auto_normalizes_to_http_provider():
    service = PerceptionService(
        read_providers={"http": FakeReadProvider()},
        default_read_provider="auto",
        fallback_read_providers=[],
        trace_enabled=False,
    )

    result = await service.read(WebReadRequest(url="https://example.com"))

    assert result.provider == "fake-read"


def test_empty_fallback_lists_are_respected():
    service = PerceptionService(
        search_providers={"primary": FakeSearchProvider()},
        read_providers={"http": FakeReadProvider()},
        fallback_search_providers=[],
        fallback_read_providers=[],
        trace_enabled=False,
    )

    assert service.fallback_search_providers == []
    assert service.fallback_read_providers == []


def test_build_perception_service_registers_configured_providers(monkeypatch):
    monkeypatch.setattr(perception_service_mod.settings, "tavily_api_key", "tvly-test")
    monkeypatch.setattr(perception_service_mod.settings, "brave_search_api_key", "")
    monkeypatch.setattr(perception_service_mod.settings, "web_search_provider", "tavily")
    monkeypatch.setattr(perception_service_mod.settings, "web_read_provider", "auto")

    service = build_perception_service(trace_enabled=False)

    assert set(service.search_providers) == {"tavily"}
    assert set(service.read_providers) == {"http", "tavily"}
    assert service.default_search_provider == "tavily"
    assert service.default_read_provider == "http"


@pytest.mark.asyncio
async def test_search_records_started_and_completed_trace(monkeypatch):
    calls = []

    async def fake_record_execution_trace(**kwargs):
        calls.append(kwargs)
        return f"trace-{len(calls)}"

    monkeypatch.setattr(
        perception_tracing,
        "record_execution_trace",
        fake_record_execution_trace,
    )
    service = PerceptionService(
        search_providers={"fake": FakeSearchProvider()},
        default_search_provider="fake",
    )

    await service.search(WebSearchRequest(query="phase 5.5"))

    assert [call["event_type"] for call in calls] == [
        "web_search_started",
        "web_search_completed",
    ]
    assert calls[0]["payload"]["query"] == "phase 5.5"
    assert calls[1]["payload"]["provider"] == "fake-search"
    assert calls[1]["payload"]["result_count"] == 1


@pytest.mark.asyncio
async def test_search_falls_back_after_provider_failure(monkeypatch):
    calls = []

    async def fake_record_execution_trace(**kwargs):
        calls.append(kwargs)
        return f"trace-{len(calls)}"

    monkeypatch.setattr(
        perception_tracing,
        "record_execution_trace",
        fake_record_execution_trace,
    )
    service = PerceptionService(
        search_providers={
            "primary": FailingSearchProvider(),
            "fallback": FakeSearchProvider(),
        },
        default_search_provider="primary",
        fallback_search_providers=["fallback"],
    )

    response = await service.search(WebSearchRequest(query="phase 5.5"))

    assert response.provider == "fake-search"
    assert [call["event_type"] for call in calls] == [
        "web_search_started",
        "web_search_provider_failed",
        "web_search_completed",
    ]
    assert calls[1]["payload"]["provider"] == "primary"


@pytest.mark.asyncio
async def test_read_falls_back_after_provider_failure():
    service = PerceptionService(
        read_providers={
            "http": FailingReadProvider(),
            "tavily": FakeReadProvider(),
        },
        default_read_provider="http",
        fallback_read_providers=["tavily"],
        trace_enabled=False,
    )

    result = await service.read(WebReadRequest(url="https://example.com"))

    assert result.provider == "fake-read"


@pytest.mark.asyncio
async def test_search_wraps_unhandled_provider_error():
    service = PerceptionService(
        search_providers={"primary": FailingSearchProvider()},
        default_search_provider="primary",
        fallback_search_providers=[],
        trace_enabled=False,
    )

    with pytest.raises(ProviderRequestError) as exc:
        await service.search(WebSearchRequest(query="phase 5.5"))

    assert exc.value.operation == "search"
    assert exc.value.provider == "primary"
    assert exc.value.details["error_type"] == "RuntimeError"


@pytest.mark.asyncio
async def test_read_trace_records_lengths_without_body(monkeypatch):
    calls = []

    async def fake_record_execution_trace(**kwargs):
        calls.append(kwargs)
        return f"trace-{len(calls)}"

    monkeypatch.setattr(
        perception_tracing,
        "record_execution_trace",
        fake_record_execution_trace,
    )
    service = PerceptionService(
        read_providers={"fake": FakeReadProvider()},
        default_read_provider="fake",
    )

    await service.read(WebReadRequest(url="https://example.com"))

    completed_payload = calls[1]["payload"]
    assert calls[1]["event_type"] == "web_read_completed"
    assert completed_payload["text_length"] == 4
    assert completed_payload["markdown_length"] == 4
    assert "text" not in completed_payload
    assert "markdown" not in completed_payload
