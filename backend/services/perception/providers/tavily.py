from typing import Any

import httpx

from services.perception.contracts import (
    WebReadRequest,
    WebReadResult,
    WebSearchRequest,
    WebSearchResult,
)
from services.perception.errors import ProviderRequestError, ProviderUnavailableError


class TavilyProvider:
    name = "tavily"
    base_url = "https://api.tavily.com"

    def __init__(self, *, api_key: str, client: httpx.AsyncClient | None = None):
        self.api_key = api_key
        self.client = client

    async def search(self, request: WebSearchRequest) -> list[WebSearchResult]:
        self._require_key("search")
        payload: dict[str, Any] = {
            "query": request.query,
            "max_results": request.count,
            "include_answer": False,
            "include_raw_content": False,
        }
        if request.include_domains:
            payload["include_domains"] = request.include_domains
        if request.exclude_domains:
            payload["exclude_domains"] = request.exclude_domains
        if request.country:
            payload["country"] = request.country
        if request.freshness:
            payload["time_range"] = request.freshness

        data = await self._post_json("/search", payload, operation="search", timeout=20)
        return [self._to_search_result(item) for item in data.get("results", [])]

    async def read(self, request: WebReadRequest) -> WebReadResult:
        self._require_key("read")
        payload = {
            "urls": [str(request.url)],
            "format": request.extract_mode,
        }
        data = await self._post_json(
            "/extract",
            payload,
            operation="read",
            timeout=request.timeout_seconds,
        )
        failed = data.get("failed_results") or []
        results = data.get("results") or []
        if not results:
            raise ProviderRequestError(
                "Tavily extract returned no readable result",
                operation="read",
                provider=self.name,
                details={"failed_results": failed},
            )

        item = results[0]
        content = item.get("raw_content") or item.get("content") or ""
        return WebReadResult(
            url=str(request.url),
            final_url=item.get("url") or str(request.url),
            title=item.get("title") or "",
            text=content,
            markdown=content,
            metadata={"failed_results": failed} if failed else {},
            provider=self.name,
            raw=item,
        )

    def _require_key(self, operation: str) -> None:
        if not self.api_key:
            raise ProviderUnavailableError(
                "Tavily API key is not configured",
                operation=operation,
                provider=self.name,
            )

    async def _post_json(
        self,
        path: str,
        payload: dict[str, Any],
        *,
        operation: str,
        timeout: int,
    ) -> dict[str, Any]:
        client = self.client or httpx.AsyncClient()
        close_client = self.client is None
        try:
            response = await client.post(
                f"{self.base_url}{path}",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            raise ProviderRequestError(
                "Tavily request failed",
                operation=operation,
                provider=self.name,
                status_code=exc.response.status_code,
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderRequestError(
                "Tavily request failed",
                operation=operation,
                provider=self.name,
                details={"error_type": type(exc).__name__},
            ) from exc
        finally:
            if close_client:
                await client.aclose()

    def _to_search_result(self, item: dict[str, Any]) -> WebSearchResult:
        return WebSearchResult(
            title=item.get("title") or "",
            url=item.get("url") or "",
            snippet=item.get("content") or item.get("snippet") or "",
            source=item.get("source"),
            published_at=item.get("published_date") or item.get("published_at"),
            score=item.get("score"),
            provider=self.name,
            raw=item,
        )

