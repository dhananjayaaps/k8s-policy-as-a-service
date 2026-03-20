"""
Migration script to remove cluster_id from policies table.
Policies should be generalized templates, not cluster-specific.
"""
import sqlite3
import os

# Get database path
db_path = os.path.join(os.path.dirname(__file__), "kyverno_manager.db")

if not os.path.exists(db_path):
    print(f"❌ Database not found at {db_path}")
    exit(1)

print(f"📦 Connecting to database: {db_path}")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Check if cluster_id column exists
    cursor.execute("PRAGMA table_info(policies)")
    columns = cursor.fetchall()
    column_names = [col[1] for col in columns]
    
    if 'cluster_id' not in column_names:
        print("✅ cluster_id column does not exist in policies table. Already clean!")
        conn.close()
        exit(0)
    
    print("🔧 Found cluster_id column in policies table. Removing...")
    
    # SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
    # Step 1: Create new table without cluster_id
    cursor.execute("""
        CREATE TABLE policies_new (
            id INTEGER PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            title VARCHAR(255),
            category VARCHAR(100),
            description TEXT,
            severity VARCHAR(50) DEFAULT 'medium',
            yaml_template TEXT NOT NULL,
            parameters JSON,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Step 2: Copy data from old table (excluding cluster_id)
    cursor.execute("""
        INSERT INTO policies_new (
            id, name, title, category, description, severity,
            yaml_template, parameters, is_active, created_at, updated_at
        )
        SELECT 
            id, name, title, category, description, severity,
            yaml_template, parameters, is_active, created_at, updated_at
        FROM policies
    """)
    
    # Step 3: Drop old table
    cursor.execute("DROP TABLE policies")
    
    # Step 4: Rename new table
    cursor.execute("ALTER TABLE policies_new RENAME TO policies")
    
    # Commit changes
    conn.commit()
    print("✅ Successfully removed cluster_id column from policies table!")
    print("📝 Policies are now generalized templates.")
    
except Exception as e:
    print(f"❌ Error during migration: {e}")
    conn.rollback()
    raise
finally:
    conn.close()

print("\n✨ Migration complete! Policies are now cluster-independent templates.")
