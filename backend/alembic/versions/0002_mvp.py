"""MVP account credentials and processing details."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("password_hash", sa.String(), nullable=True))
    op.add_column("tracks", sa.Column("stage", sa.String(), nullable=False, server_default="queued"))
    op.add_column("tracks", sa.Column("duration", sa.Float(), nullable=True))


def downgrade():
    op.drop_column("tracks", "duration")
    op.drop_column("tracks", "stage")
    op.drop_column("users", "password_hash")
