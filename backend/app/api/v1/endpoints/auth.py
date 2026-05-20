"""
Authentication endpoints: login, refresh, me.
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.schemas.schemas import LoginRequest, RefreshTokenRequest, TokenResponse, UserResponse
from app.services.auth_service import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse, summary="User Login")
async def login(form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: DBSession):
    creds = LoginRequest(email=form_data.username, password=form_data.password)
    return await auth_service.authenticate(db, creds)


@router.post("/login/json", response_model=TokenResponse, summary="User Login (JSON)")
async def login_json(creds: LoginRequest, db: DBSession):
    return await auth_service.authenticate(db, creds)


@router.post("/refresh", response_model=TokenResponse, summary="Refresh Access Token")
async def refresh_token(body: RefreshTokenRequest, db: DBSession):
    return await auth_service.refresh(db, body.refresh_token)


@router.get("/me", response_model=UserResponse, summary="Get Current User")
async def get_me(current_user: CurrentUser):
    return current_user
