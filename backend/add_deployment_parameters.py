"""
Migration script to add parameters column to policy_deployments table.
This stores the parameters used for each deployment for reuse.
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
    # Check if parameters column exists
    cursor.execute("PRAGMA table_info(policy_deployments)")
    columns = cursor.fetchall()
    column_names = [col[1] for col in columns]
    
    if 'parameters' in column_names:
        print("✅ parameters column already exists in policy_deployments table!")
        conn.close()
        exit(0)
    
    print("🔧 Adding parameters column to policy_deployments table...")
    
    # Add parameters column (JSON type in SQLite is stored as TEXT)
    cursor.execute("""
        ALTER TABLE policy_deployments 
        ADD COLUMN parameters JSON
    """)
    
    # Commit changes
    conn.commit()
    print("✅ Successfully added parameters column!")
    print("📝 Deployments can now store and reuse parameter configurations.")
    
except Exception as e:
    print(f"❌ Error during migration: {e}")
    conn.rollback()
    raise
finally:
    conn.close()

print("\n✨ Migration complete! Parameters will be stored with each deployment.")
