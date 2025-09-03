# Makefile for example-project
# Common development tasks

.PHONY: help install dev test build clean lint format check deps-check deps-update

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
	python -m pytest

test-watch: ## Run tests in watch mode
	npm run test:watch

# Code quality
lint: ## Lint code
	@echo "Linting JavaScript/TypeScript..."
	npm run lint
	@echo "Linting Python..."
	python -m flake8 .
	python -m mypy .

format: ## Format code
	@echo "Formatting JavaScript/TypeScript..."
	npm run format
	@echo "Formatting Python..."
	python -m black .
	python -m isort .

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