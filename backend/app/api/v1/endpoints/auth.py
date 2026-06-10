from typing import Annotated
import urllib.parse
import os
import uuid
import shutil

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.schemas.schemas import (
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserResponse,
    LoginResponse,
    Verify2FARequest,
    VerifyMFA2FARequest,
    Setup2FAResponse,
)
from app.services.auth_service import auth_service
from app.core.totp import generate_totp_secret, verify_totp

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse, summary="User Login")
async def login(form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: DBSession):
    creds = LoginRequest(email=form_data.username, password=form_data.password)
    return await auth_service.authenticate(db, creds)


@router.post("/login/json", response_model=LoginResponse, summary="User Login (JSON)")
async def login_json(creds: LoginRequest, db: DBSession):
    return await auth_service.authenticate(db, creds)


@router.post("/verify-2fa", response_model=TokenResponse, summary="Verify 2FA Login")
async def verify_2fa(body: VerifyMFA2FARequest, db: DBSession):
    return await auth_service.verify_mfa(db, body.mfa_token, body.code)


@router.post("/2fa/setup", response_model=Setup2FAResponse, summary="Setup 2FA")
async def setup_2fa(current_user: CurrentUser, db: DBSession):
    if current_user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is already enabled",
        )
    
    # Generate TOTP secret
    secret = generate_totp_secret()
    
    # Save the secret temporarily to db
    current_user.totp_secret = secret
    await db.flush()
    
    # Format provisioning URI
    label = urllib.parse.quote(f"ForeVim:{current_user.email}")
    issuer = urllib.parse.quote("ForeVim")
    provisioning_uri = f"otpauth://totp/{label}?secret={secret}&issuer={issuer}"
    
    return Setup2FAResponse(secret=secret, provisioning_uri=provisioning_uri)


@router.post("/2fa/enable", summary="Enable 2FA")
async def enable_2fa(body: Verify2FARequest, current_user: CurrentUser, db: DBSession):
    if current_user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is already enabled",
        )
    
    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA has not been set up. Call /auth/2fa/setup first.",
        )
    
    if not verify_totp(current_user.totp_secret, body.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code",
        )
    
    current_user.is_2fa_enabled = True
    await db.flush()
    return {"message": "Two-factor authentication successfully enabled"}


@router.post("/2fa/disable", summary="Disable 2FA")
async def disable_2fa(body: Verify2FARequest, current_user: CurrentUser, db: DBSession):
    if not current_user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is not enabled",
        )
    
    if not verify_totp(current_user.totp_secret, body.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code",
        )
    
    current_user.is_2fa_enabled = False
    current_user.totp_secret = None
    await db.flush()
    return {"message": "Two-factor authentication successfully disabled"}


@router.post("/refresh", response_model=TokenResponse, summary="Refresh Access Token")
async def refresh_token(body: RefreshTokenRequest, db: DBSession):
    return await auth_service.refresh(db, body.refresh_token)


@router.get("/me", response_model=UserResponse, summary="Get Current User")
async def get_me(current_user: CurrentUser):
    return current_user


@router.post("/me/profile-image", response_model=UserResponse, summary="Upload profile image")
async def upload_profile_image(
    current_user: CurrentUser,
    db: DBSession,
    file: UploadFile = File(...)
):
    # Validate file format (only images)
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image",
        )
    
    # Generate a unique filename using uuid
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    if not ext:
        ext = ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    
    # Save the file
    upload_dir = "uploads/profile_images"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save file: {str(e)}"
        )
    
    # Delete old profile image if it exists
    if current_user.profile_image:
        old_path = current_user.profile_image.lstrip("/")
        if os.path.exists(old_path) and "uploads/profile_images" in old_path:
            try:
                os.remove(old_path)
            except Exception:
                pass
                
    # Update the user profile image path in DB
    current_user.profile_image = f"/uploads/profile_images/{filename}"
    await db.commit()
    await db.refresh(current_user)
    
    return current_user

