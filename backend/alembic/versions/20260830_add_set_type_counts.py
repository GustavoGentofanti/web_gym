"""add per-exercise preparation set counts

Revision ID: 20260830_set_counts
Revises: 20260829_initial
Create Date: 2026-08-30 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260830_set_counts"
down_revision = "20260829_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("routine_exercises", sa.Column("warmup_sets", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("routine_exercises", sa.Column("prep_sets", sa.Integer(), nullable=False, server_default="0"))
    op.alter_column("routine_exercises", "warmup_sets", server_default=None)
    op.alter_column("routine_exercises", "prep_sets", server_default=None)


def downgrade() -> None:
    op.drop_column("routine_exercises", "prep_sets")
    op.drop_column("routine_exercises", "warmup_sets")
