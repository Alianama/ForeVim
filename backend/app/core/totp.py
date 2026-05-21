"""
Pure Python Time-based One-Time Password (TOTP) implementation (RFC 6238).
Zero-dependency and fully self-contained.
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time


def generate_totp_secret() -> str:
    """Generate a random 16-character base32 secret (10 bytes)."""
    # 10 bytes = 80 bits, which formats to exactly 16 base32 characters
    random_bytes = secrets.token_bytes(10)
    return base64.b32encode(random_bytes).decode("utf-8")


def get_hotp_token(secret: str, intervals_no: int) -> int:
    """Compute standard HMAC-based One-Time Password (HOTP)."""
    # Clean secret and add necessary base32 padding if missing
    secret = secret.replace(" ", "").upper()
    missing_padding = len(secret) % 8
    if missing_padding:
        secret += "=" * (8 - missing_padding)

    key = base64.b32decode(secret, casefold=True)
    msg = struct.pack(">Q", intervals_no)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    
    # Dynamic truncation
    o = h[19] & 15
    token = (struct.unpack(">I", h[o : o + 4])[0] & 0x7FFFFFFF) % 1000000
    return token


def verify_totp(secret: str, code: str) -> bool:
    """Verify a Time-based One-Time Password (TOTP) with a +/- 30s drift window."""
    try:
        if not secret:
            return False

        secret_clean = secret.replace(" ", "")
        code_clean = str(code).replace(" ", "")

        if len(code_clean) != 6 or not code_clean.isdigit():
            return False

        # Compute current 30-second interval number
        intervals_no = int(time.time()) // 30

        # Allow +/- 1 window (30 seconds) for time synchronization drift
        for offset in (-1, 0, 1):
            if get_hotp_token(secret_clean, intervals_no + offset) == int(code_clean):
                return True
        return False
    except Exception:
        return False
