"""Timestamp processing transitions for stale-job recovery."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("tracks", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))

def downgrade():
    op.drop_column("tracks", "updated_at")
