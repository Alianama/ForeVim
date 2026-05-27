"""Add HIGH status to VMStatus/AlertSeverity enums and create notification_config table.

Revision ID: c4f7a8b2d1e9
Revises: b2c3d4e5f6a7
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = 'c4f7a8b2d1e9'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Add 'high' to vmstatus enum ───────────────────────────────────────
    op.execute("ALTER TYPE vmstatus ADD VALUE IF NOT EXISTS 'HIGH'")

    # ── 2. Add 'high' to alertseverity enum ──────────────────────────────────
    op.execute("ALTER TYPE alertseverity ADD VALUE IF NOT EXISTS 'HIGH'")

    # ── 3. Create notification_config table ──────────────────────────────────
    op.create_table(
        'notification_config',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        # Thresholds
        sa.Column('cpu_high_threshold', sa.Float(), nullable=False, server_default='70.0'),
        sa.Column('cpu_critical_threshold', sa.Float(), nullable=False, server_default='90.0'),
        sa.Column('ram_high_threshold', sa.Float(), nullable=False, server_default='75.0'),
        sa.Column('ram_critical_threshold', sa.Float(), nullable=False, server_default='90.0'),
        sa.Column('disk_high_threshold', sa.Float(), nullable=False, server_default='70.0'),
        sa.Column('disk_critical_threshold', sa.Float(), nullable=False, server_default='85.0'),
        # Notification toggles
        sa.Column('notify_on_high', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('notify_on_critical', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('frontend_url', sa.String(500), nullable=False, server_default='http://localhost:3000'),
        # Telegram
        sa.Column('telegram_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('telegram_bot_token', sa.String(500), nullable=True),
        sa.Column('telegram_chat_id', sa.String(100), nullable=True),
        sa.Column('telegram_thread_id', sa.String(100), nullable=True),
        # Email
        sa.Column('email_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('smtp_host', sa.String(255), nullable=True),
        sa.Column('smtp_port', sa.Integer(), nullable=True, server_default='587'),
        sa.Column('smtp_username', sa.String(255), nullable=True),
        sa.Column('smtp_password', sa.String(500), nullable=True),
        sa.Column('smtp_from_email', sa.String(255), nullable=True),
        sa.Column('smtp_to_emails', sa.Text(), nullable=True),
        sa.Column('smtp_use_tls', sa.Boolean(), nullable=False, server_default='true'),
        # SNMP
        sa.Column('snmp_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('snmp_host', sa.String(255), nullable=True),
        sa.Column('snmp_port', sa.Integer(), nullable=True, server_default='162'),
        sa.Column('snmp_community', sa.String(100), nullable=True, server_default='public'),
        sa.Column('snmp_version', sa.String(10), nullable=True, server_default='2c'),
    )

    # ── 4. Seed default config row ────────────────────────────────────────────
    op.execute(
        "INSERT INTO notification_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING"
    )


def downgrade() -> None:
    op.drop_table('notification_config')
    # Note: PostgreSQL does not support removing enum values easily.
    # The 'high' values in vmstatus and alertseverity remain.
