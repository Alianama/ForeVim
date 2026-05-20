"""
FastAPI dependency injection: auth guards, RBAC, DB session.
"""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Query, WebSocket, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import User, UserRole
from app.services.auth_service import auth_service

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


# ─── Auth Dependencies ────────────────────────────────────────────────────────


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    return await auth_service.get_current_user(db, token)


CurrentUser = Annotated[User, Depends(get_current_user)]
DBSession = Annotated[AsyncSession, Depends(get_db)]


# ─── RBAC ─────────────────────────────────────────────────────────────────────


def require_role(*roles: UserRole):
    async def _dependency(current_user: CurrentUser) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return _dependency


AdminOnly = Depends(require_role(UserRole.SUPERADMIN, UserRole.ADMIN))
SuperAdminOnly = Depends(require_role(UserRole.SUPERADMIN))


# ─── WebSocket Auth ───────────────────────────────────────────────────────────


async def ws_get_token(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
) -> Optional[str]:
    """Extract token from query param for WebSocket auth."""
    return token
