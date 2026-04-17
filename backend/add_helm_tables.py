"""
Migration script: Add helm_charts and helm_releases tables.

Run this after updating models.py with HelmChart / HelmRelease.
It is safe to re-run — it uses CREATE TABLE IF NOT EXISTS via SQLAlchemy metadata.
"""

import sys
import os

# Ensure the backend directory is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db import engine, Base
from app.models import HelmChart, HelmRelease  # noqa: F401 – registers models with Base


def migrate():
    """Create helm_charts and helm_releases tables if they don't exist."""
    print("Creating helm_charts and helm_releases tables (if not exist)…")
    Base.metadata.create_all(bind=engine, tables=[
        HelmChart.__table__,
        HelmRelease.__table__,
    ])
    print("Done — tables are ready.")


if __name__ == "__main__":
    migrate()
