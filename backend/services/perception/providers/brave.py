from typing import Any

import httpx

from services.perception.contracts import WebSearchRequest, WebSearchResult
from services.perception.errors import ProviderRequestError, ProviderUnavailableError


class BraveSearchProvider:
    name = "brave"
    base_url = "https://api.search.brave.com/res/v1/web/search"

    def __init__(self, *, api_key: str, client: httpx.AsyncClient | None = None):
        self.api_key = api_key
        self.client = client

    async def search(self, request: WebSearchRequest) -> list[WebSearchResult]:
        if not self.api_key:
            raise ProviderUnavailableError(
                "Brave Search API key is not configured",
                operation="search",
                provider=self.name,
            )

        params: dict[str, Any] = {
            "q": request.query,
            "count": request.count,
        }
        if request.country:
            params["country"] = request.country
        if request.language:
            params["search_lang"] = request.language
        if request.freshness:
            params["freshness"] = request.freshness

        client = self.client or httpx.AsyncClient()
        close_client = self.client is None
        try:
            response = await client.get(
                self.base_url,
                headers={"x-subscription-token": self.api_key},
                params=params,
                timeout=20,
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as exc:
            raise ProviderRequestError(
                "Brave Search request failed",
                operation="search",
                provider=self.name,
                status_code=exc.response.status_code,
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderRequestError(
                "Brave Search request failed",
                operation="search",
                provider=self.name,
                details={"error_type": type(exc).__name__},
            ) from exc
        finally:
            if close_client:
                await client.aclose()

        return [self._to_search_result(item) for item in data.get("web", {}).get("results", [])]

    def _to_search_result(self, item: dict[str, Any]) -> WebSearchResult:
        return WebSearchResult(
            title=item.get("title") or "",
            url=item.get("url") or "",
            snippet=item.get("description") or item.get("snippet") or "",
            source=item.get("profile", {}).get("name") if isinstance(item.get("profile"), dict) else None,
            published_at=item.get("age") or item.get("page_age"),
            provider=self.name,
            raw=item,
        )

