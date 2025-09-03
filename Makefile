# Makefile for example-project
# Common development tasks

.PHONY: help install dev test build clean lint format check deps-check deps-update

# Detect tracked Python files (empty when none)
PY_FILES := $(shell git ls-files '*.py' 2>/dev/null)

# Default target
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# Installation & setup
install: ## Install all dependencies
	@echo "Installing Node.js dependencies..."
	npm install
	@echo "Installing Python dependencies..."
	pip install -r requirements.txt
	@echo "✅ All dependencies installed"

dev: ## Start development server
	@echo "Starting development server..."
	npm run dev

# Testing
test: ## Run all tests
	@echo "Running tests..."
	npm test
	@if [ -n "$(PY_FILES)" ]; then \
		echo "Running Python tests..."; \
		python -m pytest; \
	else \
		echo "No Python tests found, skipping"; \
	fi

test-watch: ## Run tests in watch mode
	npm run test:watch

# Code quality
lint: ## Lint code
	@echo "Linting JavaScript/TypeScript..."
	npm run lint
	@if [ -n "$(PY_FILES)" ]; then \
		echo "Linting Python..."; \
		python -m flake8 .; \
		python -m mypy .; \
	else \
		echo "No Python files found, skipping Python lint"; \
	fi

format: ## Format code
	@echo "Formatting JavaScript/TypeScript..."
	npm run format
	@echo "Formatting Python..."
	python -m black .
	python -m isort .

format-check: ## Check formatting (JS with Prettier)
	@echo "Checking JS formatting..."
	npm run format:check

check: lint test ## Run all checks (lint + test)

# Build & deployment
build: ## Build for production
	@echo "Building for production..."
	npm run build

clean: ## Clean build artifacts and dependencies
	@echo "Cleaning build artifacts..."
	rm -rf dist/ build/ .next/ out/
	rm -rf node_modules/ .venv/
	rm -rf __pycache__/ *.pyc .pytest_cache/
	@echo "✅ Cleaned"

# Dependencies management
deps-check: ## Check for outdated dependencies
	@echo "Checking npm dependencies..."
	npm outdated || true
	@echo "Checking pip dependencies..." 
	pip list --outdated || true

deps-update: ## Update dependencies
	@echo "Updating npm dependencies..."
	npm update
	@echo "Updating pip dependencies..."
	pip install --upgrade -r requirements.txt

coverage: ## Run tests with coverage report
	@echo "Running tests with coverage..."
	npm run -s test:cov

check: ## Run quality gate (lint + format-check + tests + coverage check)
	@echo "Running quality gate..."
	$(MAKE) lint
	$(MAKE) format-check
	$(MAKE) test
	npm run -s test:cov:check

# AI-first helpers (BMAD)
ai-status: ## Show BMAD installation status
	@npx -y bmad-method status

ai-update: ## Update BMAD core/tools if updates are available
	@npx -y bmad-method update || true

ai-rules: ## Show where to edit Trae/BMAD rules
	@echo ".trae/rules/project_rules.md"
	@echo ".bmad-core/core-config.yaml"

ai-chat: ## Call /ai/chat with a sample prompt (requires server running)
	@npm run -s ai:chat

ai-solve: ## Call /ai/solve with a sample task (requires server running)
	@npm run -s ai:solve