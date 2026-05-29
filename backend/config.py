from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Core LLM providers
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""
    deepseek_api_key: str = ""
    grok_api_key: str = ""

    # Web search providers
    brave_search_api_key: str = ""
    tavily_api_key: str = ""
    exa_api_key: str = ""
    serpapi_api_key: str = ""

    # Optional platform integrations
    github_token: str = ""
    figma_access_token: str = ""

    # Runtime / infrastructure
    cors_origins: str = "http://localhost:3000"
    max_playwright_browsers: int = 3
    database_url: str = "postgresql+asyncpg://orchestrai:orchestrai@localhost:5432/orchestrai"
    redis_url: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
