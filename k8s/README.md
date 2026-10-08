# 🚀 MeetingAgent (DHBW Viber) Kubernetes Deployment

Production-ready Kubernetes manifests for deploying MeetingAgent AI into the `dhbw-viber` namespace on k3s.

---

## 📌 Architecture & Traffic Flow

* **Namespace:** `dhbw-viber`
* **Public Domain:** [https://dhbw-viber.atai.site](https://dhbw-viber.atai.site)
* **Ingress Controller:** Traefik (handles SSL termination and URL path routing)
* **Database:** PostgreSQL 16 with `pgvector` extension and 5GB NVMe persistence
* **Backend Storage:** 10GB NVMe persistence for audio recordings and uploaded files
* **Upload Limits:** 500MB max request body configured via Traefik buffering middleware

```
Browser (https://dhbw-viber.atai.site)
  │
  ├──> Cloudflare Tunnel / Edge SSL
  │      └──> Traefik Ingress Controller
  │             ├── /api/*        ───> Service backend:8000
  │             ├── /recordings/* ───> Service backend:8000
  │             ├── /health       ───> Service backend:8000
  │             └── /* (Root)     ───> Service frontend:80 (React SPA)
```

---

## 📁 Manifests Structure

* `00-namespace.yaml` — Creates the isolated `dhbw-viber` namespace.
* `01-postgres.yaml` — PostgreSQL 16 + `pgvector` with automated `CREATE EXTENSION IF NOT EXISTS vector;` on first boot.
* `02-backend.yaml` — FastAPI Python backend with 10GB PVC, health probes, and environment secrets.
* `03-frontend.yaml` — React Vite SPA served on port 80.
* `04-ingress.yaml` — Traefik Ingress routing rules, 500MB upload middleware, and Let's Encrypt TLS.
* `kustomization.yaml` — Single entrypoint to apply all manifests together.

---

## 🛠️ Step 1: Build & Push Images

From the project root (`/Users/I750598/Documents/just-chats/meeting-agent`):

```bash
# Log in to GitHub Container Registry
echo $CR_PAT | docker login ghcr.io -u coffee3333 --password-stdin

# Build and push Backend image
docker build -t ghcr.io/coffee3333/meeting-agent-backend:latest ./backend
docker push ghcr.io/coffee3333/meeting-agent-backend:latest

# Build and push Frontend image
docker build -t ghcr.io/coffee3333/meeting-agent-frontend:latest ./frontend
docker push ghcr.io/coffee3333/meeting-agent-frontend:latest
```

---

## 🔑 Step 2: Configure Secrets

Before deploying, update `02-backend.yaml` with your real API keys (e.g. Gemini API Key, Master Password) or edit them after deployment using:

```bash
kubectl edit secret backend-secret -n dhbw-viber
```

---

## 🚀 Step 3: Deploy to Kubernetes

Deploy the entire stack with a single command:

```bash
kubectl apply -k k8s/
```

### Verify Deployment:
```bash
kubectl get pods,pvc,ingress -n dhbw-viber
```

Once all pods show `Running`, access your app at:
👉 **[https://dhbw-viber.atai.site](https://dhbw-viber.atai.site)**
