import httpx

from services.perception.contracts import WebReadRequest, WebReadResult
from services.perception.errors import ProviderRequestError
from services.perception.extraction.html import extract_html_content


class HttpFetchProvider:
    name = "http"

    def __init__(self, *, client: httpx.AsyncClient | None = None):
        self.client = client

    async def read(self, request: WebReadRequest) -> WebReadResult:
        client = self.client or httpx.AsyncClient(follow_redirects=True)
        close_client = self.client is None
        try:
            response = await client.get(
                str(request.url),
                headers={"User-Agent": "OrchestrAI-WebPerception/0.1"},
                timeout=request.timeout_seconds,
                follow_redirects=True,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ProviderRequestError(
                "HTTP fetch failed",
                operation="read",
                provider=self.name,
                status_code=exc.response.status_code,
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderRequestError(
                "HTTP fetch failed",
                operation="read",
                provider=self.name,
                details={"error_type": type(exc).__name__},
            ) from exc
        finally:
            if close_client:
                await client.aclose()

        extracted = extract_html_content(response.text, url=str(response.url))
        return WebReadResult(
            url=str(request.url),
            final_url=str(response.url),
            title=extracted.title,
            text=extracted.text,
            markdown=extracted.markdown,
            metadata={
                **extracted.metadata,
                "content_type": response.headers.get("content-type", ""),
            },
            links=extracted.links,
            provider=self.name,
            raw={"status_code": response.status_code},
        )

