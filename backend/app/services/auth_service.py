"""
Authentication service: login, registration, token refresh.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid

from fastapi import HTTPException, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.core.totp import verify_totp
from app.models.models import User, UserRole
from app.schemas.schemas import LoginRequest, TokenResponse, LoginResponse, UserCreate

logger = get_logger(__name__)

ACCESS_TOKEN_EXPIRE = 30 * 60  # seconds


class AuthService:
    async def authenticate(self, db: AsyncSession, creds: LoginRequest) -> LoginResponse:
        result = await db.execute(select(User).where(User.email == creds.email))
        user: Optional[User] = result.scalar_one_or_none()

        if not user or not verify_password(creds.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled",
            )

        if user.is_2fa_enabled:
            # Generate a short-lived MFA token (5 minutes expiration)
            mfa_token = create_access_token(
                str(user.id),
                expires_delta=timedelta(minutes=5),
                extra_claims={"type": "mfa"}
            )
            return LoginResponse(
                totp_required=True,
                mfa_token=mfa_token
            )

        user.last_login = datetime.now(timezone.utc)
        await db.flush()

        extra = {"role": user.role.value, "username": user.username}
        access = create_access_token(str(user.id), extra_claims=extra)
        refresh = create_refresh_token(str(user.id))

        logger.info("user_logged_in", user_id=str(user.id), email=user.email)
        return LoginResponse(
            totp_required=False,
            access_token=access,
            refresh_token=refresh,
            expires_in=ACCESS_TOKEN_EXPIRE,
        )

    async def verify_mfa(self, db: AsyncSession, mfa_token: str, code: str) -> TokenResponse:
        try:
            payload = decode_token(mfa_token)
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="MFA token is invalid or expired",
            )

        if payload.get("type") != "mfa":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token subject",
            )

        result = await db.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        )
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive",
            )

        if not user.is_2fa_enabled or not user.totp_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Two-factor authentication is not enabled for this user",
            )

        if not verify_totp(user.totp_secret, code):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired two-factor authentication code",
            )

        user.last_login = datetime.now(timezone.utc)
        await db.flush()

        extra = {"role": user.role.value, "username": user.username}
        access = create_access_token(str(user.id), extra_claims=extra)
        refresh = create_refresh_token(str(user.id))

        logger.info("user_logged_in_mfa", user_id=str(user.id), email=user.email)
        return TokenResponse(
            access_token=access,
            refresh_token=refresh,
            expires_in=ACCESS_TOKEN_EXPIRE,
        )


    async def refresh(self, db: AsyncSession, refresh_token: str) -> TokenResponse:
        try:
            payload = decode_token(refresh_token)
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )

        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not a refresh token",
            )

        user_id = payload.get("sub")
        result = await db.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        )
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

        extra = {"role": user.role.value, "username": user.username}
        access = create_access_token(str(user.id), extra_claims=extra)
        new_refresh = create_refresh_token(str(user.id))

        return TokenResponse(
            access_token=access,
            refresh_token=new_refresh,
            expires_in=ACCESS_TOKEN_EXPIRE,
        )

    async def create_user(self, db: AsyncSession, data: UserCreate) -> User:
        # Uniqueness check
        result = await db.execute(
            select(User).where(
                (User.email == data.email) | (User.username == data.username)
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email or username already registered",
            )

        user = User(
            email=data.email,
            username=data.username,
            hashed_password=get_password_hash(data.password),
            full_name=data.full_name,
            role=data.role,
            is_verified=True,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        logger.info("user_created", user_id=str(user.id), email=user.email)
        return user

    async def get_current_user(self, db: AsyncSession, token: str) -> User:
        try:
            payload = decode_token(token)
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

        result = await db.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        )
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

        return user


auth_service = AuthService()
