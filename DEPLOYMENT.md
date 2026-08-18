# Deployment Runbook

This deploys the Pickleball app to AWS using two CloudFormation stacks. Read `DEPLOYMENT_DECISIONS.md` alongside this file if you want the *why* behind any step — this file only covers the *how*.

## Overview

```
 You (console, once)                 GitHub Actions (every push to main)
 ─────────────────────               ──────────────────────────────────
 1. Deploy Infra stack       ──────▶  3. Assume deploy role via OIDC
    (VPC, ALB, ECS cluster,             (no AWS keys stored anywhere)
     ECR, S3, CloudFront,             4. Build backend image → push to ECR
     RDS PostgreSQL, IAM, secrets)    5. Deploy Application stack
 2. Load DB schema/seed SQL             (ECS Task Definition + Service)
    Set 4 GitHub repo variables       6. Build frontend → sync to S3
                                       7. Invalidate CloudFront
```

You do step 1–2 by hand, exactly once (or again only if you intentionally change infra). Steps 3–7 happen automatically on every `git push` to `main` after that.

**Machine requirements for you:** a web browser (for the AWS console and GitHub) and a PostgreSQL client (`psql`) for the one-time schema load. You do **not** need the AWS CLI installed anywhere on your own machine — the console handles the Infra stack, and GitHub's cloud runners handle everything else.

**Expected cost:** $0/month for the first 12 months from account creation, provided this is the only RDS Free Tier usage on the account (a single always-on `db.t3.micro` uses ~730–744 instance-hours/month on its own, i.e. nearly the entire shared 750hr/month Free Tier cap — running any other RDS instance on the same account at the same time will exceed it). After 12 months, or if the 20GB storage/750hr caps are exceeded, standard on-demand RDS pricing applies. See `DEPLOYMENT_DECISIONS.md` §4 for the full reasoning.

---

## Stack 1: Infra (`infra/infra-template.yaml`)

### What this stack creates

VPC + 2 public subnets (no NAT Gateway) · Application Load Balancer · ECS Fargate cluster · ECR repository for the backend image · S3 bucket + CloudFront distribution for the frontend · RDS PostgreSQL instance (`db.t3.micro`, Free Tier eligible) · every IAM role and the GitHub OIDC provider. This is the long-lived layer — you deploy it once by hand.

### Prepare before deploying

- [ ] **AWS account ready.** Sign in to the [AWS Console](https://console.aws.amazon.com/) and switch to **CloudFormation** (search "CloudFormation" in the top search bar).
- [ ] **Confirm no other RDS Free Tier usage on this account.** The Free Tier's 750 instance-hours/month is shared across every RDS instance on the account, all engines, all regions combined. A single always-on `db.t3.micro` here uses nearly the whole allowance by itself — if any other RDS instance is running anywhere on this account, you will be billed. Check the RDS console across regions if unsure.
- [ ] **Pick your region and confirm the engine version exists.** You said Mumbai (`ap-south-1`) — switch the region selector (top-right of the console) to **Asia Pacific (Mumbai) ap-south-1**. Then go to the **RDS console → Databases → Create database → PostgreSQL** and check the engine version dropdown for a **16.x** option (don't actually create anything there — just confirm the version exists, then cancel out). If Mumbai only offers an older 16.x minor version, note the highest available version; you'll put it in the `DBEngineVersion` parameter below (template default is `16.6`).
- [ ] **Know your GitHub `owner/repo`.** This will be `<your-github-username>/sample-app` — fill in your actual username when you get to the `GitHubRepo` parameter in the **Deploy** step below. It goes into the OIDC trust policy so only *your* repo can assume the deploy role.
- [ ] **Generate a JWT signing secret** (a long random string — this signs login tokens, treat it like a password):
  - macOS/Linux: `openssl rand -hex 32`
  - Windows PowerShell: `[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`
  - Copy the output somewhere safe — you'll paste it into the `JwtSecretValue` parameter and won't be able to read it back from the console afterward (it's marked `NoEcho`).
- [ ] **Decide `DBMasterUsername`** — default `pickleball_admin` is fine, no need to change it.
- [ ] **(Optional) Get your current public IP** if you want to load the database schema directly from your own machine after deploy — visit any "what is my IP" site in a browser, note the IPv4 address, and write it as `x.x.x.x/32`. This becomes the `AdminIngressCidr` parameter. Leave this parameter blank if you'd rather add it later (you can update the stack afterward to add it, then again to remove it).

### Parameters reference

| Parameter | Example value | Notes |
|---|---|---|
| `GitHubRepo` | `<your-github-username>/sample-app` | Required, fill in when you deploy. Must be exact (case-sensitive) — this is the only repo allowed to assume the CI deploy role. |
| `AppStackName` | `pickleball-app` | Default is fine. Whatever you put here must match `APP_STACK_NAME` in the GitHub repo variables (below) and the stack name you actually use when the Application stack deploys. |
| `DBMasterUsername` | `pickleball_admin` | Default is fine. |
| `DBEngineVersion` | `16.6` | Adjust if `ap-south-1` doesn't offer 16.6 — use the highest version you confirmed above. |
| `DBInstanceClass` | `db.t3.micro` | Default is fine — must stay `db.t3.micro` or `db.t4g.micro` to remain Free Tier eligible. |
| `JwtSecretValue` | *(the random string you generated)* | `NoEcho` — hidden in the console and in `DescribeStacks` output. |
| `AdminIngressCidr` | `203.0.113.4/32` or blank | Your IP, if you want direct DB access for the schema load. |
| `ContainerPort` | `8000` | Default is fine — matches the backend's Dockerfile. |

### Deploy

1. CloudFormation console → **Create stack** → **With new resources (standard)**.
2. **Upload a template file** → select `infra/infra-template.yaml` from this repo → Next.
3. **Stack name**: e.g. `pickleball-infra` (this is what you'll put in the `INFRA_STACK_NAME` GitHub variable later).
4. Fill in every parameter from the table above → Next.
5. Leave stack options as default → Next.
6. Review page: scroll to the bottom, tick **"I acknowledge that AWS CloudFormation might create IAM resources with custom names"** (`CAPABILITY_NAMED_IAM` — required because this stack creates roles and an OIDC provider) → **Submit**.
7. Watch the **Events** tab. A full deploy (VPC, ALB, RDS, CloudFront) typically takes **10–20 minutes** — CloudFront is usually the slowest part. This is normal; don't cancel it.

### Verify after deploying

- [ ] Stack **Status** reaches `CREATE_COMPLETE` (check the stack's top-level status, not just individual resources).
- [ ] Open the **Outputs** tab and copy these values somewhere handy — you'll need them repeatedly:
  - `CloudFrontDomainName` — this will be your app's public URL (`https://<this value>`)
  - `ECRRepositoryUri`
  - `FrontendBucketName`
  - `DBInstanceEndpoint`
  - `DBSecretArn`
  - `GitHubDeployRoleArn`
- [ ] RDS console → **Databases** → the DB instance's status shows `Available` (not `creating` or `backing-up`).
- [ ] **Load the database schema and seed data** (required — the app returns errors on every request until this is done). Full steps in the next section.
- [ ] Set up the 4 GitHub repository variables (next section) — required before the Application stack can deploy.

### Loading the database schema

You need `psql` (the PostgreSQL command-line client) on whichever machine you run this from — it does **not** need the AWS CLI.

- **Install `psql` if you don't have it:**
  - Windows: install [PostgreSQL](https://www.postgresql.org/download/windows/) (the installer includes `psql`; you can deselect the server component, you only need the client tools) — or `winget install PostgreSQL.PostgreSQL`.
  - macOS: `brew install libpq && brew link --force libpq`
  - Linux: `sudo apt install postgresql-client` (Debian/Ubuntu) or equivalent.
- **Get the DB password:** Secrets Manager console → find the secret referenced by the `DBSecretArn` output (named something like `rds!db-xxxxxxxx-xxxx-...`) → **Retrieve secret value** → copy the `password` field. (The `username`, `host`, `port`, `dbname` fields are also here if you want to double check them, but you already have those from the stack Outputs / parameters.)
- **If you left `AdminIngressCidr` blank:** go back to the CloudFormation console → your Infra stack → **Update** → keep the same template → set `AdminIngressCidr` to your IP (`x.x.x.x/32`) → deploy the update (this only touches one security group rule, it's fast, under a minute). Remember to update it again afterward to blank it out once you're done, so the DB isn't reachable from your IP indefinitely.
- **Run the schema and seed scripts** from the repo root, substituting your actual master username, password, and `DBInstanceEndpoint`:
  ```
  psql "postgresql://pickleball_admin:<password>@<DBInstanceEndpoint>:5432/pickleball" -f server/db/001_schema.sql
  psql "postgresql://pickleball_admin:<password>@<DBInstanceEndpoint>:5432/pickleball" -f server/db/002_seed.sql
  ```
  If your password contains special characters (`@`, `/`, `:`, etc.), either URL-encode them or pass them via `PGPASSWORD=<password> psql -h <endpoint> -U pickleball_admin -d pickleball -f server/db/001_schema.sql` instead — avoids the whole connection-string-escaping problem.
- **Confirm it worked:** `psql "postgresql://..." -c "\dt"` should list the app's tables (teams, matches, pools, etc.) instead of coming back empty.

### Setting the 4 GitHub repository variables

These are plain **repository variables**, not secrets — none of these 4 values are sensitive (the real secrets, DB password and JWT secret, live only in AWS Secrets Manager and are pulled by ECS at container-start time; they never touch GitHub).

1. On GitHub, go to your repo → **Settings** → **Secrets and variables** → **Actions** → click the **Variables** tab (not Secrets) → **New repository variable**, and add each of these one at a time:

| Variable name | Value |
|---|---|
| `AWS_REGION` | `ap-south-1` |
| `AWS_DEPLOY_ROLE_ARN` | the `GitHubDeployRoleArn` output from the Infra stack |
| `INFRA_STACK_NAME` | the exact name you gave the Infra stack (e.g. `pickleball-infra`) |
| `APP_STACK_NAME` | the value you used for the `AppStackName` parameter (e.g. `pickleball-app`) |

2. Double-check `INFRA_STACK_NAME` and `APP_STACK_NAME` — a typo here causes every GitHub Actions deploy to fail with a "stack not found" or export-not-found error.

---

## Stack 2: Application (`infra/app-template.yaml`, deployed by GitHub Actions)

### What this stack creates

Only the ECS **Task Definition** and **Service** for the backend container — nothing else. It imports everything it needs (roles, subnets, security groups, cluster name, secrets, CloudFront domain) from the Infra stack's Outputs. No IAM resources here, by design (see `DEPLOYMENT_DECISIONS.md` §1) — deleting this stack plus the Infra stack removes every role too.

### Prepare before deploying

- [ ] Infra stack is fully `CREATE_COMPLETE`.
- [ ] All 4 GitHub repository variables are set (previous section).
- [ ] Schema/seed SQL has been loaded — the app will 500 on its first real request otherwise (health checks will still pass; that endpoint doesn't touch the DB).
- [ ] `git push` to `main`. That's the entire trigger — `.github/workflows/deploy.yml` runs automatically on every push to that branch. No manual "run workflow" click needed (though you can also trigger it manually from the Actions tab if you add `workflow_dispatch` later).

### What happens during the deploy

Watch it live: GitHub repo → **Actions** tab → click the running workflow. Rough timing: Docker build+push ~1–2 min, CloudFormation Application-stack deploy ~2–4 min (ECS service reaching steady state is usually the slowest part), frontend build+sync ~1 min, CloudFront invalidation is asynchronous (doesn't block the workflow, but can take a couple of minutes to fully propagate).

### Verify after deploying

- [ ] GitHub Actions run shows a green checkmark on all steps.
- [ ] ECS console → your cluster (`pickleball-cluster`) → **Services** → `pickleball-backend` → the running task count matches desired count (1), and the **Health status** column shows `Healthy`. If it says `Unhealthy` or the task keeps restarting, check **Logs** (next section) before re-running the workflow.
- [ ] Open `https://<CloudFrontDomainName>` in a browser — the frontend loads.
- [ ] Log in (or hit any page that calls the API) — confirms `/api/*` is correctly routed CloudFront → ALB → Fargate → response.
- [ ] Open a live-scoring or notifications screen, open browser DevTools → **Network** tab → filter by **WS** — you should see a request to `/socket.io/...` with status `101 Switching Protocols`. If it's stuck making repeated `GET /socket.io/?transport=polling` requests and never upgrades, the WebSocket path isn't working — recheck the CloudFront `/socket.io/*` behavior in the Infra stack.

### Troubleshooting

- **ECS task stuck `PENDING` or repeatedly stopping:** ECS console → cluster → service → **Tasks** tab → click the stopped task → check the **Stopped reason**. Common causes: image pull failure (check `ECRRepositoryUri` and that the workflow's push step succeeded), or the container crashing on startup (check CloudWatch Logs next).
- **View backend logs:** CloudWatch console → **Log groups** → `/ecs/pickleball-backend` → the most recent log stream. Startup errors (bad DB connection string, missing env var) show up here immediately.
- **GitHub Actions fails on "assume role" / OIDC step:** double-check `AWS_DEPLOY_ROLE_ARN` and `AWS_REGION` variables are set correctly, and that the `GitHubRepo` parameter on the Infra stack exactly matches `<owner>/<repo>` (case-sensitive) for the repo actually running the workflow.
- **GitHub Actions fails on "stack does not exist" / import-not-found:** `INFRA_STACK_NAME` variable doesn't match the actual Infra stack name, or the Infra stack hasn't finished deploying yet.
- **Frontend loads but API calls fail (CORS or network errors in the browser console):** confirm you're hitting the app via the CloudFront URL, not the ALB DNS name directly — the ALB has no HTTPS certificate, so browsers will block or warn on direct HTTP access from an HTTPS page.

### Redeploying after code changes

Just `git push` to `main` again. Each push builds a fresh image tagged with the commit SHA, updates the Application stack to point at it, and rebuilds/re-syncs the frontend. No manual steps needed once the two stacks and 4 variables are in place.

---

## Tearing everything down

Order matters: **delete the Application stack first**, then the Infra stack (the Application stack imports the Infra stack's exports — CloudFormation blocks deleting Infra while anything still imports from it).

1. **Empty the S3 frontend bucket first.** CloudFormation won't delete a non-empty S3 bucket — S3 console → the `FrontendBucketName` bucket → **Empty** → confirm. (Or delete the Infra stack, watch it fail on the bucket, empty it, then delete again.)
2. CloudFormation console → select the Application stack → **Delete** → wait for it to finish.
3. CloudFormation console → select the Infra stack → **Delete** → wait for it to finish.

Deleting Infra removes the VPC, ALB, ECS cluster, ECR repo (including any pushed images), the now-empty S3 bucket, CloudFront distribution, RDS instance (and its managed secret), the JWT secret, and every IAM role/OIDC provider created for this deployment — nothing is left orphaned in your account.
