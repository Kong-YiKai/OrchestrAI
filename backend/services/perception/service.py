from time import perf_counter

from config import settings
from services.perception.contracts import (
    WebReadRequest,
    WebReadResult,
    WebSearchRequest,
    WebSearchResponse,
)
from services.perception.errors import (
    PerceptionError,
    ProviderRequestError,
    ProviderUnavailableError,
)
from services.perception.providers import (
    BraveSearchProvider,
    HttpFetchProvider,
    ReadProvider,
    SearchProvider,
    TavilyProvider,
)
from services.perception.tracing import (
    PerceptionTraceContext,
    trace_perception_event,
)


class PerceptionService:
    def __init__(
        self,
        *,
        search_providers: dict[str, SearchProvider] | None = None,
        read_providers: dict[str, ReadProvider] | None = None,
        default_search_provider: str = "tavily",
        default_read_provider: str = "http",
        fallback_search_providers: list[str] | None = None,
        fallback_read_providers: list[str] | None = None,
        trace_enabled: bool = True,
    ):
        self.search_providers = search_providers or {}
        self.read_providers = read_providers or {}
        self.default_search_provider = self._normalize_default_provider(
            default_search_provider,
            fallback="tavily",
        )
        self.default_read_provider = self._normalize_default_provider(
            default_read_provider,
            fallback="http",
        )
        self.fallback_search_providers = (
            ["brave"] if fallback_search_providers is None else fallback_search_providers
        )
        self.fallback_read_providers = (
            ["tavily"] if fallback_read_providers is None else fallback_read_providers
        )
        self.trace_enabled = trace_enabled

    async def search(
        self,
        request: WebSearchRequest,
        *,
        trace_context: PerceptionTraceContext | None = None,
    ) -> WebSearchResponse:
        provider_names = self._candidate_provider_names(
            requested=request.provider,
            default=self.default_search_provider,
            fallbacks=self.fallback_search_providers,
        )
        start = perf_counter()
        await self._trace(
            "web_search_started",
            {
                "provider": provider_names[0] if provider_names else None,
                "provider_candidates": provider_names,
                "query": request.query,
                "requested_count": request.count,
                "include_domains": request.include_domains,
                "exclude_domains": request.exclude_domains,
                "freshness": request.freshness,
            },
            trace_context,
        )
        last_error: Exception | None = None
        last_provider_name: str | None = None
        try:
            for provider_name in provider_names:
                provider = self.search_providers.get(provider_name)
                if not provider:
                    continue
                try:
                    results = await provider.search(request)
                except Exception as exc:
                    last_error = exc
                    last_provider_name = provider_name
                    await self._trace(
                        "web_search_provider_failed",
                        {
                            "provider": provider_name,
                            "query": request.query,
                            "latency_ms": self._elapsed_ms(start),
                            "status": "error",
                            "error_type": type(exc).__name__,
                            "error": str(exc),
                        },
                        trace_context,
                    )
                    continue
                await self._trace(
                    "web_search_completed",
                    {
                        "provider": provider.name,
                        "provider_candidates": provider_names,
                        "query": request.query,
                        "result_count": len(results),
                        "latency_ms": self._elapsed_ms(start),
                        "status": "ok",
                    },
                    trace_context,
                )
                return WebSearchResponse(
                    query=request.query,
                    provider=provider.name,
                    results=results,
                )

            if last_error:
                raise self._normalize_provider_error(
                    last_error,
                    operation="search",
                    provider=last_provider_name,
                )
            raise ProviderUnavailableError(
                "No search provider is configured for this request",
                operation="search",
                provider=provider_names[0] if provider_names else None,
                details={"provider_candidates": provider_names},
            )
        except Exception as exc:
            await self._trace(
                "web_search_failed",
                {
                    "provider": provider_names[0] if provider_names else None,
                    "provider_candidates": provider_names,
                    "query": request.query,
                    "latency_ms": self._elapsed_ms(start),
                    "status": "error",
                    "error_type": type(exc).__name__,
                    "error": str(exc),
                },
                trace_context,
            )
            raise

    async def read(
        self,
        request: WebReadRequest,
        *,
        trace_context: PerceptionTraceContext | None = None,
    ) -> WebReadResult:
        provider_names = self._candidate_provider_names(
            requested=request.provider,
            default=self.default_read_provider,
            fallbacks=self.fallback_read_providers,
        )
        start = perf_counter()
        url = str(request.url)
        await self._trace(
            "web_read_started",
            {
                "provider": provider_names[0] if provider_names else None,
                "provider_candidates": provider_names,
                "url": url,
                "extract_mode": request.extract_mode,
            },
            trace_context,
        )
        last_error: Exception | None = None
        last_provider_name: str | None = None
        try:
            for provider_name in provider_names:
                provider = self.read_providers.get(provider_name)
                if not provider:
                    continue
                try:
                    result = await provider.read(request)
                except Exception as exc:
                    last_error = exc
                    last_provider_name = provider_name
                    await self._trace(
                        "web_read_provider_failed",
                        {
                            "provider": provider_name,
                            "url": url,
                            "latency_ms": self._elapsed_ms(start),
                            "status": "error",
                            "error_type": type(exc).__name__,
                            "error": str(exc),
                        },
                        trace_context,
                    )
                    continue
                await self._trace(
                    "web_read_completed",
                    {
                        "provider": result.provider,
                        "provider_candidates": provider_names,
                        "url": url,
                        "final_url": result.final_url,
                        "title": result.title,
                        "text_length": len(result.text),
                        "markdown_length": len(result.markdown),
                        "link_count": len(result.links),
                        "latency_ms": self._elapsed_ms(start),
                        "status": "ok",
                    },
                    trace_context,
                )
                return result

            if last_error:
                raise self._normalize_provider_error(
                    last_error,
                    operation="read",
                    provider=last_provider_name,
                )
            raise ProviderUnavailableError(
                "No read provider is configured for this request",
                operation="read",
                provider=provider_names[0] if provider_names else None,
                details={"provider_candidates": provider_names},
            )
        except Exception as exc:
            await self._trace(
                "web_read_failed",
                {
                    "provider": provider_names[0] if provider_names else None,
                    "provider_candidates": provider_names,
                    "url": url,
                    "latency_ms": self._elapsed_ms(start),
                    "status": "error",
                    "error_type": type(exc).__name__,
                    "error": str(exc),
                },
                trace_context,
            )
            raise

    @staticmethod
    def _candidate_provider_names(
        *,
        requested: str,
        default: str,
        fallbacks: list[str],
    ) -> list[str]:
        if requested != "auto":
            return [requested]
        return list(dict.fromkeys([default, *fallbacks]))

    @staticmethod
    def _normalize_default_provider(value: str, *, fallback: str) -> str:
        return fallback if value == "auto" else value

    @staticmethod
    def _elapsed_ms(start: float) -> int:
        return int((perf_counter() - start) * 1000)

    @staticmethod
    def _normalize_provider_error(
        exc: Exception,
        *,
        operation: str,
        provider: str | None,
    ) -> PerceptionError:
        if isinstance(exc, PerceptionError):
            return exc
        return ProviderRequestError(
            f"{operation.title()} provider failed",
            operation=operation,
            provider=provider,
            details={"error_type": type(exc).__name__, "error": str(exc)},
        )

    async def _trace(
        self,
        event_type: str,
        payload: dict,
        context: PerceptionTraceContext | None,
    ) -> None:
        if not self.trace_enabled:
            return
        await trace_perception_event(
            event_type=event_type,
            payload=payload,
            context=context,
        )


def build_perception_service(*, trace_enabled: bool = True) -> PerceptionService:
    search_providers: dict[str, SearchProvider] = {}
    read_providers: dict[str, ReadProvider] = {
        "http": HttpFetchProvider(),
    }

    if settings.tavily_api_key:
        tavily = TavilyProvider(api_key=settings.tavily_api_key)
        search_providers["tavily"] = tavily
        read_providers["tavily"] = tavily

    if settings.brave_search_api_key:
        search_providers["brave"] = BraveSearchProvider(
            api_key=settings.brave_search_api_key,
        )

    return PerceptionService(
        search_providers=search_providers,
        read_providers=read_providers,
        default_search_provider=settings.web_search_provider,
        default_read_provider=settings.web_read_provider,
        fallback_search_providers=["brave"],
        fallback_read_providers=["tavily"],
        trace_enabled=trace_enabled,
    )


perception_service = build_perception_service()
