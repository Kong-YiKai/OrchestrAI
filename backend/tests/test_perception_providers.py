import httpx
import pytest

from services.perception import WebReadRequest, WebSearchRequest
from services.perception.extraction.html import extract_html_content
from services.perception.errors import ProviderRequestError, ProviderUnavailableError
from services.perception.providers.brave import BraveSearchProvider
from services.perception.providers.http_fetch import HttpFetchProvider
from services.perception.providers.tavily import TavilyProvider


@pytest.mark.asyncio
async def test_tavily_search_normalizes_results():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/search"
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "title": "Tavily Result",
                        "url": "https://example.com/a",
                        "content": "A useful snippet",
                        "score": 0.9,
                        "published_date": "2026-06-01",
                    }
                ]
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = TavilyProvider(api_key="tvly-test", client=client)

    results = await provider.search(WebSearchRequest(query="orchestrai", count=1))

    assert results[0].title == "Tavily Result"
    assert results[0].snippet == "A useful snippet"
    assert results[0].published_at == "2026-06-01"
    assert results[0].provider == "tavily"
    await client.aclose()


@pytest.mark.asyncio
async def test_tavily_requires_api_key():
    provider = TavilyProvider(api_key="")

    with pytest.raises(ProviderUnavailableError) as exc:
        await provider.search(WebSearchRequest(query="orchestrai"))

    assert exc.value.provider == "tavily"


@pytest.mark.asyncio
async def test_tavily_read_normalizes_extract_response():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/extract"
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "url": "https://example.com/a",
                        "raw_content": "# Title\n\nBody",
                        "title": "Title",
                    }
                ],
                "failed_results": [],
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = TavilyProvider(api_key="tvly-test", client=client)

    result = await provider.read(WebReadRequest(url="https://example.com/a"))

    assert result.title == "Title"
    assert result.markdown == "# Title\n\nBody"
    assert result.text == "# Title\n\nBody"
    assert result.provider == "tavily"
    await client.aclose()


@pytest.mark.asyncio
async def test_brave_search_normalizes_web_results():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/res/v1/web/search"
        return httpx.Response(
            200,
            json={
                "web": {
                    "results": [
                        {
                            "title": "Brave Result",
                            "url": "https://example.com/b",
                            "description": "Brave snippet",
                            "age": "2 days ago",
                        }
                    ]
                }
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = BraveSearchProvider(api_key="brave-test", client=client)

    results = await provider.search(WebSearchRequest(query="orchestrai", count=1))

    assert results[0].title == "Brave Result"
    assert results[0].snippet == "Brave snippet"
    assert results[0].published_at == "2 days ago"
    assert results[0].provider == "brave"
    await client.aclose()


@pytest.mark.asyncio
async def test_brave_wraps_upstream_status_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": "rate limited"}, request=request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = BraveSearchProvider(api_key="brave-test", client=client)

    with pytest.raises(ProviderRequestError) as exc:
        await provider.search(WebSearchRequest(query="orchestrai"))

    assert exc.value.status_code == 429
    assert exc.value.provider == "brave"
    await client.aclose()


def test_extract_html_content_returns_text_and_links():
    html = """
    <html>
      <head><title>Example</title></head>
      <body>
        <nav>Navigation</nav>
        <main><h1>Heading</h1><p>Useful body.</p><a href="/next">Next</a></main>
      </body>
    </html>
    """

    result = extract_html_content(html, url="https://example.com/start")

    assert result.title == "Example"
    assert "Heading" in result.text
    assert "Useful body." in result.text
    assert "https://example.com/next" in result.links


@pytest.mark.asyncio
async def test_http_fetch_provider_reads_html_response():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/html"},
            text="<html><head><title>Page</title></head><body><main>Body</main></body></html>",
            request=request,
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = HttpFetchProvider(client=client)

    result = await provider.read(WebReadRequest(url="https://example.com/page"))

    assert result.title == "Page"
    assert "Body" in result.text
    assert result.provider == "http"
    await client.aclose()


@pytest.mark.asyncio
async def test_http_fetch_provider_wraps_status_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="missing", request=request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = HttpFetchProvider(client=client)

    with pytest.raises(ProviderRequestError) as exc:
        await provider.read(WebReadRequest(url="https://example.com/missing"))

    assert exc.value.status_code == 404
    assert exc.value.provider == "http"
    await client.aclose()
