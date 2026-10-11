from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl


SearchProviderName = Literal["auto", "tavily", "brave"]
ReadProviderName = Literal["auto", "http", "tavily", "jina"]
ExtractMode = Literal["text", "markdown"]


class WebSearchRequest(BaseModel):
    query: str
    count: int = Field(default=5, ge=1, le=20)
    provider: SearchProviderName = "auto"
    freshness: str | None = None
    include_domains: list[str] = Field(default_factory=list)
    exclude_domains: list[str] = Field(default_factory=list)
    language: str | None = None
    country: str | None = None


class WebSearchResult(BaseModel):
    title: str
    url: str
    snippet: str = ""
    source: str | None = None
    published_at: str | None = None
    score: float | None = None
    provider: str
    raw: dict[str, Any] = Field(default_factory=dict)


class WebSearchResponse(BaseModel):
    query: str
    provider: str
    results: list[WebSearchResult] = Field(default_factory=list)


class WebReadRequest(BaseModel):
    url: HttpUrl
    provider: ReadProviderName = "auto"
    extract_mode: ExtractMode = "markdown"
    timeout_seconds: int = Field(default=20, ge=1, le=120)


class WebReadResult(BaseModel):
    url: str
    final_url: str | None = None
    title: str = ""
    text: str = ""
    markdown: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    links: list[str] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    provider: str
    raw: dict[str, Any] = Field(default_factory=dict)

