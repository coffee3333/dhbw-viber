#!/usr/bin/env bash
# ==============================================================================
# 🚀 MeetingAgent (DHBW Viber) - Kubernetes Deployment Script
# Automates image building, container registry push, and k3s deployment
# ==============================================================================

set -eo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
REGISTRY="ghcr.io"
GITHUB_USER="coffee3333"
NAMESPACE="dhbw-viber"
BACKEND_IMAGE="${REGISTRY}/${GITHUB_USER}/meeting-agent-backend"
FRONTEND_IMAGE="${REGISTRY}/${GITHUB_USER}/meeting-agent-frontend"
TAG="${1:-latest}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}  🚀 Deploying MeetingAgent AI to Kubernetes (k3s)${NC}"
echo -e "  📍 Namespace:       ${GREEN}${NAMESPACE}${NC}"
echo -e "  🌐 Public Domain:   ${GREEN}https://dhbw-viber.atai.site${NC}"
echo -e "  🏷️ Image Tag:       ${YELLOW}${TAG}${NC}"
echo -e "${BLUE}==========================================================${NC}"

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo -e "${RED}❌ Docker is not installed or not in PATH.${NC}" >&2; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo -e "${RED}❌ kubectl is not installed or not in PATH.${NC}" >&2; exit 1; }

# Step 1: Build Docker images
echo -e "\n${BLUE}[1/4] 📦 Building Docker images...${NC}"

echo "Building Backend (${BACKEND_IMAGE}:${TAG})..."
docker build -t "${BACKEND_IMAGE}:${TAG}" ./backend

echo "Building Frontend (${FRONTEND_IMAGE}:${TAG})..."
docker build -t "${FRONTEND_IMAGE}:${TAG}" ./frontend

# Step 2: Push Docker images
echo -e "\n${BLUE}[2/4] 📤 Pushing Docker images to GitHub Container Registry (${REGISTRY})...${NC}"
docker push "${BACKEND_IMAGE}:${TAG}"
docker push "${FRONTEND_IMAGE}:${TAG}"

# Step 3: Apply Kubernetes manifests
echo -e "\n${BLUE}[3/4] ☸️ Applying Kubernetes manifests to namespace '${NAMESPACE}'...${NC}"
kubectl apply -k k8s/

# Restart deployments to ensure new images are pulled
echo "Triggering rolling update for backend and frontend..."
kubectl rollout restart deployment backend frontend -n "${NAMESPACE}"

# Step 4: Wait for rollout completion
echo -e "\n${BLUE}[4/4] ⏳ Waiting for pods to become ready...${NC}"
kubectl rollout status deployment/postgres -n "${NAMESPACE}" --timeout=120s
kubectl rollout status deployment/backend -n "${NAMESPACE}" --timeout=180s
kubectl rollout status deployment/frontend -n "${NAMESPACE}" --timeout=120s

echo -e "\n${GREEN}==========================================================${NC}"
echo -e "${GREEN}  ✅ Deployment successfully completed!${NC}"
echo -e "  👉 Open in browser: https://dhbw-viber.atai.site"
echo -e "${GREEN}==========================================================${NC}"

echo -e "\n📊 Running Pods in '${NAMESPACE}':"
kubectl get pods,pvc,ingress -n "${NAMESPACE}"
