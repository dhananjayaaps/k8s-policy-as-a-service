"""
Migration: Add email and full_name columns to users table.

Run this script once to add the new profile fields.
Usage: python add_user_profile_fields.py
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "kyverno_manager.db")


def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}. It will be created on first app start.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check existing columns
    cursor.execute("PRAGMA table_info(users)")
    columns = {row[1] for row in cursor.fetchall()}

    added = []

    if "email" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN email VARCHAR(255)")
        added.append("email")

    if "full_name" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN full_name VARCHAR(255)")
        added.append("full_name")

    if added:
        conn.commit()
        print(f"Added columns to users table: {', '.join(added)}")
    else:
        print("All columns already exist. No changes needed.")

    conn.close()


if __name__ == "__main__":
    migrate()
