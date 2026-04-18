.PHONY: spike build run tidy

GO ?= go

tidy:
	$(GO) mod tidy

spike:
	$(GO) run ./cmd/spike

build:
	$(GO) build -o bin/copilot-buddy ./cmd/copilot-buddy

run: build
	./bin/copilot-buddy
