# AWS database sizing — CMS

For this CMS workload, you're nowhere near big-DB territory. Realistic sizing
follows.

## Data footprint estimate

- ~250 published docs (88 services + 152 orgs + categories) × ~30KB average
  (Lexical body + fields) ≈ **7-10MB** raw content.
- Drafts + autosave versions: maybe 20× multiplier on actively edited docs
  → **50-100MB** live.
- Postgres overhead (indexes, WAL, system catalogs, pgvector embeddings if
  chat RAG shares this DB): another **100-200MB**.
- Realistic working size: **200-500MB**.

## RDS Postgres recommendation

| Stage          | Instance                              | Storage                              | Multi-AZ |
| -------------- | ------------------------------------- | ------------------------------------ | -------- |
| Dev / sandbox  | `db.t4g.micro` (2 vCPU burst, 1GB RAM) | 20GB gp3                             | No       |
| Production     | `db.t4g.small` (2 vCPU burst, 2GB RAM) | 20-50GB gp3 with autoscaling enabled | Yes      |
| Heavier traffic | `db.t4g.medium` (4GB RAM)             | 50GB gp3                             | Yes      |

**20GB minimum** because that's the floor on gp3 — anything smaller and
you'd pay the same anyway. Enable storage autoscaling with a cap (say
100GB) so a runaway draft-spam scenario doesn't lock you up.

## Settings worth turning on

- **Encryption at rest** (government data).
- **Automated backups**, 7-day retention (default is fine).
- **Performance Insights** (free tier, lets you spot slow queries).
- **pgvector** extension if the chat RAG embeddings live in the same
  database.

## What WON'T be in the DB

- Media uploads → put those in S3 with the Payload S3 plugin. Don't store
  binary in Postgres.

## RAG embeddings consideration

If RAG embeddings share this database (pgvector), bump to **`db.t4g.small`
minimum** — embeddings tables grow fast and vector indexes want RAM. If RAG
has its own DB instance, the CMS one can stay micro.

## Cost ballpark

(us-east-1, on-demand, no reserved instances.)

- `db.t4g.micro` + 20GB gp3 + basic backups ≈ **~$15/month**.
- `db.t4g.small` + 50GB gp3 + Multi-AZ ≈ **~$50/month**.

For an alpha-stage site, `db.t4g.micro` single-AZ is fine. Go Multi-AZ when
you have actual citizen traffic depending on it.
