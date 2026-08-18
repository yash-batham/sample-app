# Deployment Decisions

Log of every architectural decision made for the AWS deployment, and why. Read alongside `DEPLOYMENT.md` (the operational runbook) and the two templates in `infra/`.

## 1. Two stacks: Infra (manual) and Application (CI-managed)

`infra/infra-template.yaml` holds everything long-lived and rarely-changed: networking, load balancer, ECS cluster/ECR, S3+CloudFront, the database, and **all IAM roles**. `infra/app-template.yaml` holds only the ECS Task Definition and Service.

**Why:** the user deploys Infra once by hand via the CloudFormation console, then GitHub Actions redeploys only the Application stack on every push. Keeping IAM entirely in the Infra stack (rather than split across both) means deleting the Application stack and then the Infra stack removes every created resource with no orphaned roles left behind — an explicit requirement.

## 2. No NAT Gateway — Fargate and the RDS instance live in public subnets

A NAT Gateway costs ~$32-35/month plus data processing, which is not free-tier eligible and would dominate the cost of this whole deployment. Instead, both public subnets have an Internet Gateway route, ECS tasks get `AssignPublicIp: ENABLED`, and the RDS instance is `PubliclyAccessible: true`.

**Why it's still reasonably safe:** nothing is actually exposed by having a public IP alone — security groups do the real access control. The Fargate security group only accepts inbound traffic from the ALB's security group; the DB security group only accepts inbound traffic from the Fargate security group (plus an optional, temporary single-IP rule for one-time schema loading). No security group allows arbitrary internet inbound except the ALB on port 80.

## 3. One CloudFront distribution serves both the frontend and the API/WebSocket

There's no custom domain, so there's no ACM certificate available for the ALB. If the frontend (HTTPS via CloudFront) called the ALB directly (plain HTTP, no cert possible without a domain), browsers would block it as mixed content.

**Fix:** the same CloudFront distribution has three behaviors:
- `/*` (default) → S3 origin (the built frontend), via Origin Access Control — the bucket itself is fully private.
- `/api/*` → ALB origin (HTTP only, since it has no cert), caching disabled, forwarding all headers (needed for the `Authorization: Bearer <jwt>` header) and query strings.
- `/socket.io/*` → same ALB origin, same policy — CloudFront passes through `Upgrade`/`Connection` headers so the Socket.IO WebSocket upgrade works transparently once the initial polling handshake succeeds.

**Side benefit:** the frontend and backend end up same-origin (one CloudFront domain for everything), so most requests never trigger a CORS preflight in the first place. `CORS_ORIGINS` is still set to the CloudFront URL as a safety net for any cross-origin edge case, but it is not load-bearing for the common case.

## 4. Plain RDS PostgreSQL (`db.t3.micro`) instead of Aurora — genuine Free Tier, not scale-to-zero

The user wants the database to cost nothing. Aurora — including Serverless v2 with `ServerlessV2ScalingConfiguration.MinCapacity: 0` (an earlier version of this template used exactly that) — has **no AWS Free Tier allocation at all**, on any account, ever. It bills per ACU-hour with zero free allowance, and even storage/backup storage are billed from hour one. The traditional RDS Free Tier (750 instance-hours/month of `db.t3/t4g.micro`, 20GB storage, 20GB backup, for 12 months from account creation) only applies to standard, non-Aurora RDS engines.

So this template creates a single `AWS::RDS::DBInstance` (`Engine: postgres`, `DBInstanceClass: db.t3.micro`, `AllocatedStorage: 20`, `StorageType: gp2`, `MultiAZ: false`) instead of an Aurora cluster — genuinely $0/month within Free Tier limits, not merely "close to free."

**Tradeoffs accepted, logged explicitly:**
- **No scale-to-zero.** A single instance runs 24/7. This is fine under Free Tier because the allowance is hours-based, not idle-based — but a single always-on `db.t3.micro` alone consumes ~730–744 of the 750 free hours/month, leaving effectively no headroom for any *other* RDS instance on the same account in the same billing period.
- **Single-AZ only.** `MultiAZ: false` is required to stay Free Tier eligible — no automatic failover if the instance's AZ has an outage. Acceptable for a demo/low-traffic deployment.
- **20GB storage ceiling.** Free Tier caps storage at 20GB (`gp2`); exceeding it or choosing a different storage type moves that portion to standard billing.
- **Time-boxed.** The 750hr/20GB allowance only applies for 12 months from account creation. After that, this instance bills at normal on-demand RDS rates (a `db.t3.micro` in most regions is a few dollars/month, far cheaper than Aurora would have been at the same always-on usage pattern).

## 5. DB credentials via RDS-managed Secrets Manager secret, not a hand-built one

`AWS::RDS::DBInstance` supports `ManageMasterUserPassword: true` — AWS creates and manages a Secrets Manager secret automatically, populated with `username`, `password`, `host`, `port`, `dbname`, `engine` as JSON keys after the instance exists. This avoids manually building a `GenerateSecretString` template and hitting a circular dependency (the DB endpoint isn't known until the instance is created, but the secret would normally need to exist before the instance references it).

The Application stack's ECS task definition maps `DB_USER` and `DB_PASSWORD` directly to that secret's `username`/`password` keys via ECS's native `secrets` field — the values never appear in the task definition, console, or CI logs.

**Required backend change:** `server/app/config.py`'s `database_url` was a single opaque string with no assembly logic. Added optional `db_host`/`db_port`/`db_user`/`db_password`/`db_name` fields plus a validator that assembles `database_url` from them when present. Local development is unaffected — `.env`'s `DATABASE_URL` still works exactly as before when the split vars aren't set.

## 6. GitHub OIDC instead of long-lived IAM access keys

The Infra stack creates an `AWS::IAM::OIDCProvider` for `token.actions.githubusercontent.com` and a deploy role trusted only for the specific `owner/repo` supplied as the `GitHubRepo` parameter (via a `sub` claim condition: `repo:<owner>/<repo>:*`). GitHub Actions assumes this role per-run via a short-lived token — no AWS secret keys are ever stored in the repo.

**Why:** eliminates the risk of a leaked long-lived credential, and the trust condition means no other repository can assume this role even if the role ARN becomes known.

## 7. ALB security group allows `0.0.0.0/0` on port 80, not CloudFront-only

AWS publishes a managed prefix list for CloudFront's origin-facing IPs, which could restrict the ALB security group to CloudFront traffic only. This was **not** used, to keep the template portable and avoid depending on a prefix list ID that isn't guaranteed identical across every account/region. Given there's no sensitive data reachable without passing through the app's own auth anyway, and the ALB has no cert (so a direct hit just gets plain HTTP with no meaningful additional exposure beyond what CloudFront already forwards), this was judged an acceptable simplification for a free-tier demo deployment. It can be tightened later by adding a prefix-list-scoped ingress rule.

## 8. Legacy static HTML mockups excluded from deployment

The repo root contains pre-existing static HTML files (`index.html`, `admin-*.html`, etc.) that predate the real `client/` React app. Only `client/dist` (the Vite production build) is synced to S3 — the legacy mockups are not part of this deployment.
