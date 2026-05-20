import asyncio
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.models import VM
from app.core.security import decode_token

router = APIRouter(prefix="/ssh", tags=["SSH"])
logger = logging.getLogger(__name__)

@router.websocket("/{vm_id}")
async def ssh_terminal(websocket: WebSocket, vm_id: uuid.UUID, token: str = Query(...)):
    await websocket.accept()
    
    try:
        from jose import JWTError
        payload = decode_token(token)
        if not payload or payload.get("type") != "access":
            await websocket.close(code=1008, reason="Invalid token")
            return
    except Exception:
        await websocket.close(code=1008, reason="Unauthorized")
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(VM).where(VM.id == vm_id))
        vm = result.scalar_one_or_none()
        if not vm:
            await websocket.close(code=4004, reason="VM not found")
            return
            
    ip_address = vm.ip_address

    # Send initial WS progress
    try:
        await websocket.send_text(json.dumps({
            "status": "progress",
            "message": "📡 Establishing secure WebSocket connection... [Done]"
        }))
    except Exception:
        pass

    try:
        auth_msg_raw = await websocket.receive_text()
        auth_msg = json.loads(auth_msg_raw)
        username = auth_msg.get("username")
        password = auth_msg.get("password")
        otp = auth_msg.get("otp")
        port = auth_msg.get("port", 22)
        trusted_fingerprints = auth_msg.get("trusted_fingerprints", [])

        try:
            port = int(port)
        except (ValueError, TypeError):
            port = 22

        await websocket.send_text(json.dumps({
            "status": "progress",
            "message": f"🔍 Connecting to remote host {ip_address}:{port}..."
        }))

        import asyncssh

        # Custom client to intercept and validate host key fingerprints
        class MySSHClient(asyncssh.SSHClient):
            def __init__(self, password, otp):
                self.trusted_fingerprints = trusted_fingerprints or []
                self.password = password
                self.otp = otp
                self.presented_fingerprint = None
                self.presented_algorithm = None

            def validate_host_public_key(self, host, addr, port, key):
                fp = key.get_fingerprint()
                self.presented_fingerprint = fp
                self.presented_algorithm = key.get_algorithm()
                # Trust if client already provided this fingerprint as trusted
                if fp in self.trusted_fingerprints:
                    return True
                return False

            def kbdint_auth_requested(self):
                return ""

            async def kbdint_challenge_received(self, name, instructions, lang, prompts):
                responses = []
                for prompt, echo in prompts:
                    prompt_lower = prompt.lower()
                    if "password" in prompt_lower:
                        responses.append(self.password or "")
                    elif "verification code" in prompt_lower or "otp" in prompt_lower or "2fa" in prompt_lower or "token" in prompt_lower:
                        responses.append(self.otp or "")
                    else:
                        responses.append("")
                return responses

        client = MySSHClient(password, otp)

        await websocket.send_text(json.dumps({
            "status": "progress",
            "message": "🔒 Exchanging keys and verifying host fingerprint..."
        }))

        try:
            conn = await asyncssh.connect(
                ip_address,
                port=port,
                username=username,
                password=password,
                client_factory=lambda: client,
                client_keys=None,
            )
        except Exception as e:
            # If host key wasn't verified, prompt user with key details
            if isinstance(e, asyncssh.HostKeyNotVerifiable) and client.presented_fingerprint:
                await websocket.send_text(json.dumps({
                    "status": "fingerprint_required",
                    "fingerprint": client.presented_fingerprint,
                    "algorithm": client.presented_algorithm,
                    "host": ip_address,
                    "port": port
                }))
            else:
                await websocket.send_text(json.dumps({
                    "status": "failed",
                    "message": f"Connection failed: {str(e)}"
                }))
            await websocket.close()
            return

        await websocket.send_text(json.dumps({
            "status": "progress",
            "message": "👤 Authenticated successfully! Initializing terminal shell..."
        }))

        try:
            process = await conn.create_process(
                term_type='xterm-256color',
                term_size=(80, 24),
                env={'TERM': 'xterm-256color'},
                encoding='utf-8',
                errors='replace'
            )
        except Exception as e:
            await websocket.send_text(json.dumps({
                "status": "failed",
                "message": f"Failed to start terminal process: {str(e)}"
            }))
            conn.close()
            await websocket.close()
            return

        # Notify frontend that we are connected, so it can boot xterm
        await websocket.send_text(json.dumps({
            "status": "connected"
        }))
        
        async def forward_read():
            try:
                while True:
                    data = await process.stdout.read(8192)
                    if not data:
                        break
                    await websocket.send_text(data)
            except Exception as e:
                logger.error(f"SSH Read error: {e}")

        async def forward_write():
            try:
                while True:
                    data = await websocket.receive_text()
                    try:
                        # Try parsing as JSON to check if it's a control message (like resize)
                        msg = json.loads(data)
                        if isinstance(msg, dict) and msg.get("type") == "resize":
                            cols = msg.get("cols", 80)
                            rows = msg.get("rows", 24)
                            process.change_terminal_size(cols, rows)
                            continue
                    except Exception:
                        pass
                    
                    process.stdin.write(data)
                    await process.stdin.drain()
            except WebSocketDisconnect:
                pass
            except Exception as e:
                logger.error(f"WS Read error: {e}")

        task_read = asyncio.create_task(forward_read())
        task_write = asyncio.create_task(forward_write())
        
        await asyncio.wait([task_read, task_write], return_when=asyncio.FIRST_COMPLETED)
        
        process.stdin.close()
        try:
            await process.wait_closed()
        except:
            pass
        conn.close()
        await websocket.close()

    except Exception as e:
        logger.error(f"SSH Exception: {e}")
        try:
            await websocket.send_text(json.dumps({
                "status": "failed",
                "message": f"SSH connection error: {str(e)}"
            }))
            await websocket.close()
        except:
            pass
