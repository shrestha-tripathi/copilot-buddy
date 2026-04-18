.PHONY: spike build run tidy test test-integration release clean

GO ?= go
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -s -w -X main.version=$(VERSION)

tidy:
	$(GO) mod tidy

spike:
	$(GO) run ./cmd/spike

build:
	$(GO) build -ldflags '$(LDFLAGS)' -o bin/copilot-buddy ./cmd/copilot-buddy

run: build
	./bin/copilot-buddy

test:
	$(GO) test ./...

test-integration:
	$(GO) test -tags=integration -timeout=180s -v ./...

clean:
	rm -rf bin dist

# ---- cross-compiled release binaries ------------------------------------
# Outputs:  dist/copilot-buddy_<os>_<arch>[.exe]
PLATFORMS := linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64

release: clean
	@mkdir -p dist
	@for p in $(PLATFORMS); do \
		os=$${p%/*}; arch=$${p#*/}; \
		ext=""; if [ $$os = "windows" ]; then ext=".exe"; fi; \
		out="dist/copilot-buddy_$${os}_$${arch}$${ext}"; \
		echo ">> $$out"; \
		GOOS=$$os GOARCH=$$arch CGO_ENABLED=0 \
			$(GO) build -trimpath -ldflags '$(LDFLAGS)' -o $$out ./cmd/copilot-buddy || exit 1; \
	done
	@cd dist && for f in copilot-buddy_*; do sha256sum $$f >> SHA256SUMS; done
	@echo "==> Built $$(ls dist | wc -l) artefacts in backend/dist/"
