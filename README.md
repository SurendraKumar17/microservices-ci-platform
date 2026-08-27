# Production-Grade Microservices Platform on Kubernetes

# microservices-gitops-platform

> A production-grade GitOps platform built on AWS EKS with full CI/CD, security scanning, multi-environment promotion, and observability — following real-world DevOps engineering practices.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Services](#services)
- [Branching Strategy](#branching-strategy)
- [CI/CD Pipeline](#cicd-pipeline)
- [Infrastructure](#infrastructure)
- [GitOps — ArgoCD](#gitops--argocd)
- [Observability](#observability)
- [Security](#security)
- [Environments](#environments)
- [Pipeline Ownership](#pipeline-ownership)
- [Getting Started](#getting-started)
- [Secrets Reference](#secrets-reference)
- [Tech Stack](#tech-stack)

---

## Overview

This platform demonstrates a complete **production-grade DevOps architecture** for deploying and operating microservices on Kubernetes. It implements:

- **GitFlow branching** with per-branch CI/CD pipelines
- **GitOps delivery** via ArgoCD — Git is the single source of truth for deployments
- **Multi-environment promotion** — Dev → Staging → Production
- **Security at every stage** — secret scanning, SAST, container scanning, DAST, IaC scanning
- **Full observability** — metrics, logs, and alerting via Prometheus, Grafana, and CloudWatch

---

## Architecture

```
Developer
    │
    ▼
GitHub (GitFlow branching)
    │
    ▼
GitHub Actions (per-branch CI pipelines)
    │  ├── Secret scan (TruffleHog)
    │  ├── Lint (Hadolint)
    │  ├── Unit tests
    │  ├── SAST (SonarQube)
    │  ├── Build + Push → AWS ECR
    │  ├── Container scan (Trivy)
    │  └── IaC scan (Trivy)
    │
    ▼
GitOps Update (values.yaml commit)
    │
    ▼
ArgoCD (auto-sync from Git)
    │
    ├── bookstore-dev       → EKS Dev namespace
    ├── bookstore-staging   → EKS Staging namespace
    └── bookstore-prod      → EKS Prod namespace
    │
    ▼
AWS EKS (Kubernetes)
    │
    ├── ALB Ingress Controller  (traffic routing)
    ├── HPA                     (horizontal pod autoscaling)
    ├── Cluster Autoscaler      (node autoscaling)
    └── Microservices (book, frontend, search, user)
    │
    ▼
Observability
    ├── Prometheus + Grafana  (metrics & dashboards)
    ├── CloudWatch            (alerts & scaling triggers)
    └── OWASP ZAP             (DAST on staging)
```

---

## Repository Structure

```
microservices-gitops-platform/
│
├── .github/
│   └── workflows/
│       ├── ci-feature.yml       # Feature branch CI + PR → develop validation
│       ├── ci-develop.yml       # Develop branch CI + Dev deploy
│       ├── ci-release.yml       # Release branch CI + Staging deploy + QA gate
│       └── ci-main.yml          # Main branch CI + Prod deploy + approval gate
│
├── services/
│   ├── book/                    # Book management microservice
│   ├── frontend/                # Frontend microservice
│   ├── search/                  # Search microservice
│   └── user/                    # User management microservice
│
├── gitops/
│   └── environments/
│       ├── dev/
│       │   └── values.yaml      # Dev image tags (auto-updated by CI)
│       ├── staging/
│       │   └── values.yaml      # Staging image tags
│       └── prod/
│           └── values.yaml      # Prod image tags
│
├── argocd/                      # ArgoCD Application manifests
│
├── infrastructure/              # Terraform — VPC, EKS, IAM, ECR
│
├── observability/               # Prometheus, Grafana configs
│
└── README.md
```

---

## Services

| Service | Description | Language |
|---|---|---|
| `book` | Book catalog CRUD API | Node.js |
| `frontend` | Web UI serving the bookstore | JavaScript |
| `search` | Full-text search across catalog | Node.js |
| `user` | User auth and profile management | Node.js |

Each service has its own `Dockerfile` and is built, scanned, and pushed to AWS ECR independently. CI detects which services changed per push using `dorny/paths-filter` — only changed services are rebuilt.

---

## Branching Strategy

This project follows **GitFlow**:

```
feature/xyz
    │
    └──► PR ──► develop  ──► PR ──► release/1.0  ──► PR ──► main
                  │                      │                    │
                 DEV               STAGING                  PROD
```

| Branch | Purpose | Deploys To |
|---|---|---|
| `feature/**` | New features, bug fixes | — (no deploy) |
| `develop` | Integration branch | Dev environment |
| `release/**` | Release candidates | Staging environment |
| `main` | Production-ready code | Production environment |
| `hotfix/**` | Emergency production fixes | Fast-path lint + scan only |

---

## CI/CD Pipeline

Each branch has a **dedicated pipeline file** under `.github/workflows/`. No shared pipeline — each branch owns its own CI scope.

### `ci-feature.yml` — Feature Branch
Triggers on: `push` to `feature/**` and `pull_request` → `develop`

```
Secret scan (TruffleHog)
    → Dockerfile lint (Hadolint)
    → Unit tests
    → SonarQube SAST
```

### `ci-develop.yml` — Develop Branch
Triggers on: `push` to `develop`

```
Compute image tag (dev-<sha>)
    → Secret scan
    → Detect changed services
    → Build & Push to ECR (matrix: book/frontend/search/user)
    → Trivy container scan
    → SonarQube SAST
    → GitOps update (dev/values.yaml)
    → ArgoCD sync wait
    → Smoke tests (health endpoints)
    → Integration tests
```

### `ci-release.yml` — Release Branch
Triggers on: `push` to `release/**` and `pull_request` → `release/**`

```
[PR only]  Secret scan + lint + unit tests + SonarQube PR decoration

[Push]     Compute image tag (staging-<sha>)
    → Secret scan
    → Detect changed services
    → Build & Push to ECR
    → Trivy container scan (table + SARIF)
    → Trivy IaC scan (gitops/ Helm/Terraform)
    → SonarQube SAST
    → GitOps update (staging/values.yaml)
    → ArgoCD sync wait
    → Smoke tests
    → Integration tests
    → E2E tests (Playwright — chromium/firefox/webkit)
    → Performance tests (k6 — smoke + load)
    → OWASP ZAP DAST baseline scan
    → Manual QA gate (GitHub Environment approval)
```

### `ci-main.yml` — Main Branch
Triggers on: `push` to `main`

```
Compute image tag (prod-<sha>)
    → Secret scan
    → Detect changed services
    → Build & Push to ECR
    → Trivy container scan (BLOCKING — exit-code: 1)
    → Trivy IaC scan (BLOCKING)
    → SonarQube SAST
    → Production approval gate (GitHub Environment reviewers)
    → GitOps update (prod/values.yaml)
    → ArgoCD sync wait
    → Smoke tests
    → Synthetic monitoring (critical user paths)
    → Git release tag (release-YYYYMMDD-<sha>)
```

### Image Tagging Strategy

| Branch | Tag Format | Example |
|---|---|---|
| `develop` | `dev-<sha8>` | `dev-a1b2c3d4` |
| `release/**` | `staging-<sha8>` | `staging-a1b2c3d4` |
| `main` | `prod-<sha8>` | `prod-a1b2c3d4` |

Each service also gets a `latest-<env>` floating tag for easy reference.

---

## Infrastructure

Provisioned with **Terraform** under `infrastructure/`:

- **VPC** — custom VPC with public/private subnets across multiple AZs
- **EKS Cluster** — managed Kubernetes control plane
- **Node Groups** — EC2 worker nodes with Cluster Autoscaler (ASG)
- **IAM** — OIDC-based GitHub Actions role (no long-lived keys), ECR push permissions
- **ECR** — private container registry per service
- **ALB** — AWS Load Balancer Controller for ingress

### Autoscaling

| Layer | Tool | Trigger |
|---|---|---|
| Pod | HPA | CPU/memory thresholds |
| Node | Cluster Autoscaler | Pending pods |
| Infrastructure | ASG | CloudWatch alarms |

---

## GitOps — ArgoCD

ArgoCD watches the `gitops/environments/` directory. When CI commits updated image tags to `values.yaml`, ArgoCD detects the drift and syncs automatically.

```
CI pipeline
    │
    └──► commits to gitops/environments/dev/values.yaml
                        │
                        ▼
                    ArgoCD detects diff
                        │
                        ▼
                    Syncs bookstore-dev app
                        │
                        ▼
                    Kubernetes rolls out new pods
```

ArgoCD applications:

| App | Namespace | Source |
|---|---|---|
| `bookstore-dev` | `dev` | `gitops/environments/dev/` |
| `bookstore-staging` | `staging` | `gitops/environments/staging/` |
| `bookstore-prod` | `prod` | `gitops/environments/prod/` |

---

## Observability

Located under `observability/`:

| Tool | Purpose |
|---|---|
| **Prometheus** | Metrics collection from all services and Kubernetes |
| **Grafana** | Dashboards — pod health, request rates, latency, error rates |
| **CloudWatch** | AWS-level metrics, alarms, and scaling triggers |
| **OWASP ZAP** | DAST security scanning on every staging deployment |
| **k6** | Performance/load testing on staging (smoke + load profiles) |

---

## Security

Security is enforced at every stage of the pipeline — not as an afterthought.

| Stage | Tool | What It Checks |
|---|---|---|
| Every push | **TruffleHog** | Secrets, API keys, credentials in code |
| Every push | **Hadolint** | Dockerfile best practices |
| PR + branch | **SonarQube** | SAST — code vulnerabilities, code smells |
| After build | **Trivy (image)** | CVEs in container images — CRITICAL/HIGH |
| Staging + Prod | **Trivy (IaC)** | Misconfigs in Helm charts and Terraform |
| Every staging deploy | **OWASP ZAP** | DAST — runtime web vulnerabilities |

Trivy is **non-blocking** on dev/staging (logs findings) and **blocking** on main (fails pipeline on CRITICAL/HIGH).

---

## Environments

| Environment | Branch | Deploy Method | Post-deploy Tests | Gate |
|---|---|---|---|---|
| **Dev** | `develop` | ArgoCD auto-sync | Smoke + Integration | None |
| **Staging** | `release/**` | ArgoCD auto-sync | Smoke + Integration + E2E + Perf + ZAP | Manual QA approval |
| **Prod** | `main` | ArgoCD auto-sync | Smoke + Synthetic monitoring | Manual reviewer approval |

---

## Pipeline Ownership

This project follows a clear ownership split between DevOps and Dev teams:

**DevOps owns:**
- All pipeline YAML files and job wiring
- TruffleHog, Hadolint, Trivy, ZAP configuration
- SonarQube project config and quality gate thresholds
- ArgoCD sync + health wait logic
- Smoke tests (`tests/smoke/smoke.sh`)
- Synthetic monitoring scripts (`tests/smoke/synthetic.sh`)
- k6 performance scripts (`tests/performance/`)
- `.zap/rules.tsv` false-positive suppression

**Dev team owns:**
- Unit test files (`services/{svc}/tests/unit/`)
- Integration test files (`tests/integration/`)
- E2E test specs (`tests/e2e/*.spec.ts` — Playwright)

---

## Getting Started

### Prerequisites

- AWS CLI configured
- Terraform >= 1.5
- kubectl
- ArgoCD CLI
- GitHub Actions secrets configured (see below)

### 1. Provision Infrastructure

```bash
cd infrastructure/
terraform init
terraform plan
terraform apply
```

### 2. Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -f argocd/
```

### 3. Configure GitHub Secrets

See [Secrets Reference](#secrets-reference) below.

### 4. Push to a Feature Branch

```bash
git checkout -b feature/your-feature
# make changes
git push origin feature/your-feature
# open PR → develop
```

CI runs automatically. Once merged to develop, it deploys to dev. Then promote through release → main.

---

## Secrets Reference

Configure these in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `ECR_REGISTRY` | AWS ECR registry URL |
| `ARGOCD_SERVER` | ArgoCD server URL |
| `ARGOCD_TOKEN` | ArgoCD auth token |
| `DEV_URL` | Dev environment base URL |
| `STAGING_URL` | Staging environment base URL |
| `PROD_URL` | Production environment base URL |
| `SONAR_TOKEN` | SonarCloud authentication token |
| `SONAR_HOST_URL` | SonarCloud host (https://sonarcloud.io) |

AWS authentication uses **OIDC** (no static credentials)
---

## Tech Stack

| Category | Tool |
|---|---|
| **Cloud** | AWS (EKS, ECR, VPC, IAM, CloudWatch, ALB) |
| **Infrastructure as Code** | Terraform (HCL) |
| **Container Orchestration** | Kubernetes (EKS) |
| **Container Registry** | AWS ECR |
| **GitOps / CD** | ArgoCD |
| **CI** | GitHub Actions |
| **Secret Scanning** | TruffleHog |
| **Dockerfile Linting** | Hadolint |
| **SAST** | SonarQube / SonarCloud |
| **Container Security** | Trivy |
| **IaC Security** | Trivy config scan |
| **DAST** | OWASP ZAP |
| **Performance Testing** | k6 |
| **E2E Testing** | Playwright |
| **Metrics** | Prometheus |
| **Dashboards** | Grafana |
| **Alerting** | CloudWatch |
| **Languages** | HCL, JavaScript, Dockerfile |

---

## Author

**Surendra Kumar** — [github.com/SurendraKumar17](https://github.com/SurendraKumar17)

> Built as a production-grade reference implementation covering the full DevOps lifecycle: infrastructure provisioning, containerisation, CI/CD pipelines, GitOps delivery, security scanning, and observability.
