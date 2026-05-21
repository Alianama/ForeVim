"""
Resolusi URL Prometheus dari database (bukan dari env).
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import PrometheusSource


async def resolve_prometheus_url(
    db: AsyncSession,
    source_id: Optional[uuid.UUID] = None,
) -> str:
    """
    Ambil URL Prometheus dari source yang dipilih atau source aktif pertama.
    """
    if source_id:
        result = await db.execute(
            select(PrometheusSource).where(
                PrometheusSource.id == source_id,
                PrometheusSource.is_active.is_(True),
            )
        )
        source = result.scalar_one_or_none()
        if not source:
            raise HTTPException(
                status_code=404,
                detail="Prometheus source tidak ditemukan atau nonaktif",
            )
        return source.url

    result = await db.execute(
        select(PrometheusSource)
        .where(PrometheusSource.is_active.is_(True))
        .order_by(PrometheusSource.created_at.asc())
        .limit(1)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(
            status_code=400,
            detail="Belum ada Prometheus source aktif. Tambahkan di halaman Prometheus Sources.",
        )
    return source.url
