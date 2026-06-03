from fastapi import APIRouter, HTTPException

from services.perception import (
    WebReadRequest,
    WebReadResult,
    WebSearchRequest,
    WebSearchResponse,
    perception_service,
)
from services.perception.errors import PerceptionError, ProviderUnavailableError

router = APIRouter(prefix="/perception", tags=["perception"])


@router.post("/search", response_model=WebSearchResponse)
async def search(request: WebSearchRequest) -> WebSearchResponse:
    try:
        return await perception_service.search(request)
    except PerceptionError as exc:
        raise HTTPException(
            status_code=_perception_status_code(exc),
            detail={
                "message": str(exc),
                "operation": exc.operation,
                "provider": exc.provider,
                "details": exc.details,
            },
        ) from exc


@router.post("/read", response_model=WebReadResult)
async def read(request: WebReadRequest) -> WebReadResult:
    try:
        return await perception_service.read(request)
    except PerceptionError as exc:
        raise HTTPException(
            status_code=_perception_status_code(exc),
            detail={
                "message": str(exc),
                "operation": exc.operation,
                "provider": exc.provider,
                "details": exc.details,
            },
        ) from exc


def _perception_status_code(exc: PerceptionError) -> int:
    if isinstance(exc, ProviderUnavailableError):
        return 503
    return 502
