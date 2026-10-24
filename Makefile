# Family OS — common tasks. Run `make help`.
SHELL := /bin/bash
BACKEND := backend
FRONTEND := frontend

.PHONY: help install dev-infra dev-api dev-worker dev-bot dev-web migrate test test-backend test-frontend e2e lint format typecheck build up down logs backup restore-check audit

help:
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  %-16s %s\n", $$1, $$2}'

install: ## Install backend (uv) and frontend (npm) dependencies
	cd $(BACKEND) && uv sync
	cd $(FRONTEND) && npm ci

dev-infra: ## Start local PostgreSQL + Redis in Docker
	docker compose -f compose.dev.yaml up -d

migrate: ## Apply database migrations
	cd $(BACKEND) && .venv/bin/alembic upgrade head

dev-api: ## Run the API with auto-reload (uses backend/.env)
	cd $(BACKEND) && .venv/bin/uvicorn app.main:app --reload --port 8000

dev-worker: ## Run the background worker
	cd $(BACKEND) && .venv/bin/python -m app.workers

dev-bot: ## Run the Telegram bot (polling)
	cd $(BACKEND) && .venv/bin/python -m app.bot

dev-web: ## Run the Vite dev server (proxies /api to :8000)
	cd $(FRONTEND) && npm run dev

test: test-backend test-frontend ## Run backend and frontend unit/integration tests

test-backend: ## Backend tests against the PostgreSQL test database
	cd $(BACKEND) && .venv/bin/pytest -q

test-frontend: ## Frontend unit tests
	cd $(FRONTEND) && npm test

e2e: ## Playwright end-to-end tests (starts backend + preview build)
	cd $(FRONTEND) && npx playwright test

lint: ## Ruff + TypeScript checks
	cd $(BACKEND) && .venv/bin/ruff check app tests scripts && .venv/bin/ruff format --check app tests scripts && .venv/bin/mypy app
	cd $(FRONTEND) && npx tsc -b

format: ## Auto-format backend code
	cd $(BACKEND) && .venv/bin/ruff check --fix app tests && .venv/bin/ruff format app tests

build: ## Build production Docker images
	docker compose build

up: ## Start the production stack
	docker compose up -d

down: ## Stop the stack (data volumes are kept)
	docker compose down

logs: ## Follow logs
	docker compose logs -f --tail=100

backup: ## Back up database and files (see README)
	./infra/scripts/backup.sh

restore-check: ## Verify the latest backup restores cleanly
	./infra/scripts/restore-check.sh

audit: ## Check dependencies for known vulnerabilities
	cd $(BACKEND) && .venv/bin/pip-audit
	cd $(FRONTEND) && npm audit --omit=dev
