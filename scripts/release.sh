#!/bin/bash

# Flowya Release Script
# Usage: ./scripts/release.sh [patch|minor|major]
# Example: ./scripts/release.sh patch  # 1.0.12 -> 1.0.13

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ========================================
# Load credentials from .env.release
# ========================================
if [ -f ".env.release" ]; then
    source .env.release
else
    echo -e "${RED}Error: .env.release file not found${NC}"
    echo "Create .env.release with:"
    echo '  export GH_TOKEN="your_github_token"'
    echo '  export APPLE_ID="your_apple_id"'
    echo '  export APPLE_TEAM_ID="your_team_id"'
    echo '  export APPLE_APP_SPECIFIC_PASSWORD="your_app_password"'
    exit 1
fi

# Verify required environment variables
if [ -z "$GH_TOKEN" ]; then
    echo -e "${RED}Error: GH_TOKEN not set in .env.release${NC}"
    exit 1
fi

if [ -z "$APPLE_ID" ] || [ -z "$APPLE_TEAM_ID" ] || [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ]; then
    echo -e "${RED}Error: Apple credentials not set in .env.release${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Credentials loaded from .env.release${NC}"

# Get bump type (default: patch)
BUMP_TYPE=${1:-patch}

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: Invalid bump type. Use: patch, minor, or major${NC}"
    exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Current version: $CURRENT_VERSION${NC}"

# Calculate new version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
case $BUMP_TYPE in
    major)
        NEW_VERSION="$((MAJOR + 1)).0.0"
        ;;
    minor)
        NEW_VERSION="$MAJOR.$((MINOR + 1)).0"
        ;;
    patch)
        NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
        ;;
esac

echo -e "${GREEN}New version: $NEW_VERSION${NC}"

# Update package.json version
echo -e "${YELLOW}Updating package.json...${NC}"
npm version $NEW_VERSION --no-git-tag-version

# Build, sign, notarize, and publish
echo -e "${YELLOW}Building, signing, notarizing, and publishing to GitHub...${NC}"
echo -e "${YELLOW}(This may take a few minutes for notarization)${NC}"
npm run package -- --publish always

# Wait for upload to complete
echo -e "${YELLOW}Waiting for upload to complete...${NC}"
sleep 5

# Get the release ID
echo -e "${YELLOW}Getting release ID...${NC}"
sleep 3

RELEASE_ID=$(curl -s -H "Authorization: token $GH_TOKEN" \
    https://api.github.com/repos/juanchoabdon/flowya-releases/releases | \
    python3 -c "import sys, json; releases = json.load(sys.stdin); print(next((r['id'] for r in releases if r['tag_name'] == 'v$NEW_VERSION'), ''))")

if [ -z "$RELEASE_ID" ]; then
    echo -e "${RED}Error: Could not find release ID${NC}"
    echo -e "${YELLOW}Trying alternative method...${NC}"
    RELEASE_ID=$(curl -s -H "Authorization: token $GH_TOKEN" \
        "https://api.github.com/repos/juanchoabdon/flowya-releases/releases/tags/v$NEW_VERSION" | \
        python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))")
fi

if [ -z "$RELEASE_ID" ]; then
    echo -e "${RED}Error: Could not find release ID after retries${NC}"
    exit 1
fi

echo -e "${GREEN}Release ID: $RELEASE_ID${NC}"

# Publish the release (remove draft status)
echo -e "${YELLOW}Publishing release...${NC}"
curl -s -X PATCH \
    -H "Authorization: token $GH_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"draft": false}' \
    "https://api.github.com/repos/juanchoabdon/flowya-releases/releases/$RELEASE_ID" > /dev/null

# Check if latest-mac.yml was uploaded
echo -e "${YELLOW}Checking latest-mac.yml...${NC}"
ASSETS=$(curl -s -H "Authorization: token $GH_TOKEN" \
    "https://api.github.com/repos/juanchoabdon/flowya-releases/releases/$RELEASE_ID/assets" | \
    grep '"name"')

if [[ ! "$ASSETS" =~ "latest-mac.yml" ]]; then
    echo -e "${YELLOW}Uploading latest-mac.yml...${NC}"
    curl -s -X POST \
        -H "Authorization: token $GH_TOKEN" \
        -H "Content-Type: text/yaml" \
        --data-binary @"release/latest-mac.yml" \
        "https://uploads.github.com/repos/juanchoabdon/flowya-releases/releases/$RELEASE_ID/assets?name=latest-mac.yml" > /dev/null
fi

# Verify
echo -e "${YELLOW}Verifying release...${NC}"
LATEST=$(curl -sL https://github.com/juanchoabdon/flowya-releases/releases/latest/download/latest-mac.yml | head -1)

if [[ "$LATEST" == "version: $NEW_VERSION" ]]; then
    echo -e "${GREEN}✅ Release v$NEW_VERSION published successfully!${NC}"
    echo -e "${GREEN}🔗 https://github.com/juanchoabdon/flowya-releases/releases/tag/v$NEW_VERSION${NC}"
else
    echo -e "${RED}Warning: Could not verify release. Please check manually.${NC}"
fi

# Commit and push
echo -e "${YELLOW}Committing and pushing...${NC}"
git add package.json package-lock.json
git commit -m "chore: bump version to $NEW_VERSION"
git push origin main

echo -e "${GREEN}🎉 Done! Release v$NEW_VERSION is live!${NC}"
