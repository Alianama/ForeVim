"""add_user_2fa

Revision ID: 8242b0d773ab
Revises: 31ddbf3493f8
Create Date: 2026-05-21 09:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8242b0d773ab'
down_revision: Union[str, None] = '31ddbf3493f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add totp_secret (nullable) and is_2fa_enabled (non-nullable with default false)
    op.add_column('users', sa.Column('totp_secret', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('is_2fa_enabled', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'is_2fa_enabled')
    op.drop_column('users', 'totp_secret')
