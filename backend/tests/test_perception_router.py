import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.perception.contracts import (
    WebReadResult,
    WebSearchResponse,
    WebSearchResult,
)
from services.perception.errors import ProviderRequestError, ProviderUnavailableError
from routers import perception


class FakePerceptionService:
    async def search(self, request):
        return WebSearchResponse(
            query=request.query,
            provider="fake",
            results=[
                WebSearchResult(
                    title="Result",
                    url="https://example.com",
                    snippet=request.query,
                    provider="fake",
                )
            ],
        )

    async def read(self, request):
        return WebReadResult(
            url=str(request.url),
            final_url=str(request.url),
            title="Page",
            text="Body",
            markdown="Body",
            provider="fake",
        )


class UnavailablePerceptionService:
    async def search(self, request):
        raise ProviderUnavailableError(
            "not configured",
            operation="search",
            provider="tavily",
        )

    async def read(self, request):
        raise ProviderUnavailableError(
            "not configured",
            operation="read",
            provider="http",
        )


class FailedPerceptionService:
    async def search(self, request):
        raise ProviderRequestError(
            "upstream failed",
            operation="search",
            provider="tavily",
            status_code=401,
        )

    async def read(self, request):
        raise ProviderRequestError(
            "upstream failed",
            operation="read",
            provider="http",
            status_code=500,
        )


@pytest.mark.asyncio
async def test_debug_search_endpoint_delegates_to_service(monkeypatch):
    monkeypatch.setattr(perception, "perception_service", FakePerceptionService())

    response = await perception.search(perception.WebSearchRequest(query="phase 5.5"))

    assert response.provider == "fake"
    assert response.results[0].snippet == "phase 5.5"


@pytest.mark.asyncio
async def test_debug_read_endpoint_delegates_to_service(monkeypatch):
    monkeypatch.setattr(perception, "perception_service", FakePerceptionService())

    response = await perception.read(perception.WebReadRequest(url="https://example.com"))

    assert response.provider == "fake"
    assert response.markdown == "Body"


@pytest.mark.asyncio
async def test_debug_search_maps_missing_provider_to_503(monkeypatch):
    monkeypatch.setattr(perception, "perception_service", UnavailablePerceptionService())

    with pytest.raises(perception.HTTPException) as exc:
        await perception.search(perception.WebSearchRequest(query="phase 5.5"))

    assert exc.value.status_code == 503
    assert exc.value.detail["provider"] == "tavily"


@pytest.mark.asyncio
async def test_debug_search_maps_provider_failure_to_502(monkeypatch):
    monkeypatch.setattr(perception, "perception_service", FailedPerceptionService())

    with pytest.raises(perception.HTTPException) as exc:
        await perception.search(perception.WebSearchRequest(query="phase 5.5"))

    assert exc.value.status_code == 502
    assert exc.value.detail["provider"] == "tavily"
