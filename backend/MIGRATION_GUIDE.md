# Database Migration Guide

## Migration: `kubeconfig_path` → `kubeconfig_content`

This guide helps you migrate from storing kubeconfig file paths to storing kubeconfig content directly in the database.

## Why This Change?

**Problem with Paths:**
- ❌ Path `/home/user/.kube/config` doesn't exist on another user's machine
- ❌ Path dependencies break when users connect from different computers
- ❌ File may be moved, deleted, or modified externally

**Benefits of Content:**
- ✅ Portable across all machines and users
- ✅ No file system dependencies
- ✅ Works in containerized environments
- ✅ Database becomes single source of truth

## Migration Steps

### Option 1: Automatic Migration Script (Recommended)

Create a migration script to convert existing records:

```python
# migrate_kubeconfig.py
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
import os

# Database connection
DATABASE_URL = "sqlite:///./kyverno.db"  # Update with your database URL
engine = create_engine(DATABASE_URL)

def migrate_clusters():
    """Migrate kubeconfig_path to kubeconfig_content"""
    
    with Session(engine) as session:
        # First, add the new column (if using manual migration)
        # session.execute(text("ALTER TABLE clusters ADD COLUMN kubeconfig_content TEXT"))
        
        # Get all clusters with kubeconfig_path
        result = session.execute(
            text("SELECT id, name, kubeconfig_path FROM clusters WHERE kubeconfig_content IS NULL OR kubeconfig_content = ''")
        )
        
        migrated = 0
        failed = 0
        
        for row in result:
            cluster_id, name, path = row
            
            try:
                # Read kubeconfig content from file
                if os.path.exists(path):
                    with open(path, 'r') as f:
                        content = f.read()
                    
                    # Update cluster with content
                    session.execute(
                        text("UPDATE clusters SET kubeconfig_content = :content WHERE id = :id"),
                        {"content": content, "id": cluster_id}
                    )
                    migrated += 1
                    print(f"✅ Migrated cluster '{name}' (ID: {cluster_id})")
                else:
                    print(f"⚠️  Skipped cluster '{name}' (ID: {cluster_id}) - File not found: {path}")
                    failed += 1
                    
            except Exception as e:
                print(f"❌ Failed to migrate cluster '{name}' (ID: {cluster_id}): {e}")
                failed += 1
        
        session.commit()
        
        print(f"\n📊 Migration Summary:")
        print(f"   Migrated: {migrated}")
        print(f"   Failed/Skipped: {failed}")

if __name__ == "__main__":
    print("Starting kubeconfig migration...")
    migrate_clusters()
    print("Migration complete!")
```

Run the migration:
```bash
cd backend
python migrate_kubeconfig.py
```

### Option 2: Manual SQL Migration

If you prefer SQL commands:

```sql
-- Step 1: Add new column (if not exists)
ALTER TABLE clusters ADD COLUMN kubeconfig_content TEXT;

-- Step 2: For each cluster, manually update with content
-- (You need to read the file and paste content)
UPDATE clusters 
SET kubeconfig_content = '
apiVersion: v1
kind: Config
clusters:
  - cluster:
      server: https://...
    name: my-cluster
...(full kubeconfig)...'
WHERE id = 1;

-- Step 3: Verify migration
SELECT id, name, 
       CASE 
         WHEN kubeconfig_content IS NOT NULL AND kubeconfig_content != '' 
         THEN '✅ Migrated' 
         ELSE '❌ Not Migrated' 
       END as status
FROM clusters;

-- Step 4: (Optional) Remove old column after verification
-- ALTER TABLE clusters DROP COLUMN kubeconfig_path;
```

### Option 3: Fresh Start (If No Important Data)

If your database doesn't contain important cluster data:

```bash
# Backup current database
cp backend/kyverno.db backend/kyverno.db.backup

# Delete database and recreate
rm backend/kyverno.db

# Restart application (it will create new schema automatically)
cd backend
uvicorn app.main:app --reload
```

Then re-add clusters using the new API endpoint with kubeconfig content.

## Using Alembic for Migration (Recommended for Production)

### 1. Install Alembic

```bash
pip install alembic
```

### 2. Initialize Alembic

```bash
cd backend
alembic init alembic
```

### 3. Configure Alembic

Edit `alembic.ini`:
```ini
sqlalchemy.url = sqlite:///./kyverno.db
```

Edit `alembic/env.py`:
```python
from app.db import Base
from app.models import Cluster, Policy, PolicyDeployment, AuditLog

target_metadata = Base.metadata
```

### 4. Create Migration

```bash
alembic revision -m "migrate_kubeconfig_path_to_content"
```

### 5. Edit Migration File

Edit the generated file in `alembic/versions/xxxxx_migrate_kubeconfig_path_to_content.py`:

```python
"""migrate kubeconfig_path to content

Revision ID: xxxxx
Revises: 
Create Date: 2024-xx-xx

"""
from alembic import op
import sqlalchemy as sa
import os

def upgrade():
    # Add new column
    op.add_column('clusters', sa.Column('kubeconfig_content', sa.Text(), nullable=True))
    
    # Migrate data
    connection = op.get_bind()
    
    # Read existing clusters
    clusters = connection.execute(sa.text("SELECT id, kubeconfig_path FROM clusters")).fetchall()
    
    for cluster_id, path in clusters:
        try:
            if os.path.exists(path):
                with open(path, 'r') as f:
                    content = f.read()
                
                connection.execute(
                    sa.text("UPDATE clusters SET kubeconfig_content = :content WHERE id = :id"),
                    {"content": content, "id": cluster_id}
                )
                print(f"Migrated cluster ID {cluster_id}")
        except Exception as e:
            print(f"Failed to migrate cluster ID {cluster_id}: {e}")
    
    # Make kubeconfig_content NOT NULL after migration
    op.alter_column('clusters', 'kubeconfig_content', nullable=False)
    
    # Drop old column (optional - comment out if you want to keep it temporarily)
    # op.drop_column('clusters', 'kubeconfig_path')

def downgrade():
    # Revert changes
    op.add_column('clusters', sa.Column('kubeconfig_path', sa.Text(), nullable=True))
    # Copy content back to files would be complex, so just allow NULL
    op.drop_column('clusters', 'kubeconfig_content')
```

### 6. Run Migration

```bash
alembic upgrade head
```

## Verification

After migration, verify everything works:

```bash
# Test connecting to a migrated cluster
curl -X POST http://localhost:8000/clusters/1/connect

# Check cluster details
curl http://localhost:8000/clusters/1
```

## Rollback Plan

If something goes wrong:

1. **With Alembic:**
   ```bash
   alembic downgrade -1
   ```

2. **Manual Rollback:**
   ```bash
   # Restore from backup
   cp backend/kyverno.db.backup backend/kyverno.db
   
   # Revert code changes
   git checkout HEAD~1
   ```

## Common Issues

### Issue: "kubeconfig_content cannot be NULL"

**Solution:** Ensure all clusters have content before making column NOT NULL:
```sql
UPDATE clusters SET kubeconfig_content = '' WHERE kubeconfig_content IS NULL;
```

### Issue: "File not found during migration"

**Solution:** For clusters where files don't exist:
1. Manually obtain the kubeconfig content
2. Update the cluster record directly
3. Or delete the cluster record and re-add it

### Issue: "Database locked"

**Solution:** Stop the application before running migration:
```bash
# Stop the app
# Then run migration
# Restart the app
```

## Security Note

**⚠️ IMPORTANT:** After migrating to storing kubeconfig content:

1. **Enable database encryption at rest**
2. **Restrict database access**
3. **Use encrypted backups**
4. **Add API authentication**
5. **Monitor audit logs**

The kubeconfig content contains sensitive credentials that must be protected!

## Need Help?

If you encounter issues during migration:

1. Check the application logs: `backend/logs/`
2. Verify database schema: `sqlite3 kyverno.db ".schema clusters"`
3. Test with a single cluster first before batch migration
4. Keep database backups before and after migration

## Post-Migration Checklist

- [ ] All clusters migrated successfully
- [ ] Test connecting to each cluster
- [ ] Verify Kyverno operations still work
- [ ] Database backup taken
- [ ] Old kubeconfig_path column removed (optional)
- [ ] Documentation updated for team
- [ ] API clients updated to use kubeconfig_content
- [ ] Security measures implemented (encryption, auth)
