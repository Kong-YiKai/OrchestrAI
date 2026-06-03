from typing import Protocol, runtime_checkable

from services.perception.contracts import (
    WebReadRequest,
    WebReadResult,
    WebSearchRequest,
    WebSearchResult,
)


@runtime_checkable
class SearchProvider(Protocol):
    name: str

    async def search(self, request: WebSearchRequest) -> list[WebSearchResult]:
        ...


@runtime_checkable
class ReadProvider(Protocol):
    name: str

    async def read(self, request: WebReadRequest) -> WebReadResult:
        ...

