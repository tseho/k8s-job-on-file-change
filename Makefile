REGISTRY ?= tseho
RELEASE := $(shell jq '.version' package.json)

RELEASE_MAJOR := $(shell echo $(RELEASE) | cut -d. -f1)
RELEASE_MINOR := $(shell echo $(RELEASE) | cut -d. -f2)
RELEASE_PATCH := $(shell echo $(RELEASE) | cut -d. -f3)
RELEASE_NEXT := $(shell echo "$(RELEASE_MAJOR).$(RELEASE_MINOR).$$(($(RELEASE_PATCH) + 1))")

.PHONY: publish
publish:
	npm ci
	npm run build
	git tag v$(RELEASE) || true
	docker buildx build --platform linux/arm64,linux/amd64 -t $(REGISTRY)/k8s-pihole-traefik-sidecar:$(RELEASE) -t $(REGISTRY)/k8s-pihole-traefik-sidecar:latest --push .
	git push origin v$(RELEASE)

.PHONY: next
next:
	yq -i '.version="$(RELEASE_NEXT)"' package.json
	npm install
