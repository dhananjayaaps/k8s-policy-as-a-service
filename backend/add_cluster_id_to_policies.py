"""
Database migration: Add cluster_id to policies table

This makes policies cluster-specific instead of global templates.
"""

import sqlite3
import sys
from pathlib import Path

def add_cluster_id_to_policies():
    # Locate database
    db_path = Path(__file__).parent / "kyverno_manager.db"
    
    if not db_path.exists():
        print(f"❌ Database not found at {db_path}")
        print("Run the server first to create the database.")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(policies)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'cluster_id' in columns:
            print("✓ Column 'cluster_id' already exists in policies table")
            conn.close()
            return True
        
        print("Adding 'cluster_id' column to policies table...")
        
        # Add cluster_id column (nullable initially for existing records)
        cursor.execute("""
            ALTER TABLE policies 
            ADD COLUMN cluster_id INTEGER
        """)
        
        # Add foreign key constraint (SQLite doesn't support direct FK addition)
        # Note: In production, you'd recreate the table with the FK
        
        conn.commit()
        print("✓ Successfully added 'cluster_id' column to policies table")
        print("⚠ Note: Existing policies have NULL cluster_id. You may need to delete or update them.")
        
        conn.close()
        return True
        
    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    success = add_cluster_id_to_policies()
    sys.exit(0 if success else 1)
