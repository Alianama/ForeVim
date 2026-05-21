"""add forecast algorithm auto enum value

Revision ID: a1b2c3d4e5f6
Revises: 8242b0d773ab
Create Date: 2026-05-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "8242b0d773ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE forecastalgorithm ADD VALUE IF NOT EXISTS 'auto'")


def downgrade() -> None:
    pass
