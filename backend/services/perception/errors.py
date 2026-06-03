from typing import Any


class PerceptionError(Exception):
    def __init__(
        self,
        message: str,
        *,
        operation: str,
        provider: str | None = None,
        status_code: int | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.operation = operation
        self.provider = provider
        self.status_code = status_code
        self.details = details or {}


class ProviderUnavailableError(PerceptionError):
    pass


class ProviderRequestError(PerceptionError):
    pass


class ExtractionError(PerceptionError):
    pass

