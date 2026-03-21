"""
Migration: Add user_id and username columns to audit_logs table
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "kyverno_manager.db")

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check existing columns
    cursor.execute("PRAGMA table_info(audit_logs)")
    columns = {row[1] for row in cursor.fetchall()}

    if "user_id" not in columns:
        cursor.execute("ALTER TABLE audit_logs ADD COLUMN user_id INTEGER")
        print("Added 'user_id' column to audit_logs")
    else:
        print("'user_id' column already exists")

    if "username" not in columns:
        cursor.execute("ALTER TABLE audit_logs ADD COLUMN username VARCHAR(255)")
        print("Added 'username' column to audit_logs")
    else:
        print("'username' column already exists")

    conn.commit()
    conn.close()
    print("Migration complete!")

if __name__ == "__main__":
    migrate()
