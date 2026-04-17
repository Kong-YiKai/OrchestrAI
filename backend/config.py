from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""
    cors_origins: str = "http://localhost:3000"
    max_playwright_browsers: int = 3
    database_url: str = "postgresql+asyncpg://orchestrai:orchestrai@localhost:5432/orchestrai"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
