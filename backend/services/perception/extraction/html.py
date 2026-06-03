from html.parser import HTMLParser
from urllib.parse import urljoin

from pydantic import BaseModel, Field


class ExtractedHtml(BaseModel):
    title: str = ""
    text: str = ""
    markdown: str = ""
    metadata: dict[str, str] = Field(default_factory=dict)
    links: list[str] = Field(default_factory=list)


class _ReadableHtmlParser(HTMLParser):
    def __init__(self, base_url: str):
        super().__init__()
        self.base_url = base_url
        self.title = ""
        self.links: list[str] = []
        self._chunks: list[str] = []
        self._title_chunks: list[str] = []
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
        if tag == "title":
            self._in_title = True
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(urljoin(self.base_url, href))
        if tag in {"p", "br", "div", "section", "article", "main", "li", "h1", "h2", "h3"}:
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_depth > 0:
            self._skip_depth -= 1
        if tag == "title":
            self._in_title = False
            self.title = " ".join("".join(self._title_chunks).split())
        if tag in {"p", "div", "section", "article", "main", "li", "h1", "h2", "h3"}:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        value = " ".join(data.split())
        if not value:
            return
        if self._in_title:
            self._title_chunks.append(value)
            return
        self._chunks.append(value)

    def readable_text(self) -> str:
        lines = [" ".join(line.split()) for line in "".join(self._chunks).splitlines()]
        return "\n".join(line for line in lines if line)


def extract_html_content(html: str, *, url: str) -> ExtractedHtml:
    try:
        import trafilatura

        extracted = trafilatura.extract(
            html,
            url=url,
            include_links=False,
            include_comments=False,
            output_format="markdown",
        )
    except Exception:
        extracted = None

    parser = _ReadableHtmlParser(url)
    parser.feed(html)
    fallback_text = parser.readable_text()
    markdown = extracted or fallback_text
    text = markdown

    return ExtractedHtml(
        title=parser.title,
        text=text,
        markdown=markdown,
        metadata={},
        links=list(dict.fromkeys(parser.links)),
    )

