#!/bin/bash
set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up worktree environment...${NC}\n"

# Determine paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_WORKTREE="$(dirname "$SCRIPT_DIR")"
CURRENT_DIR="$(pwd)"

# Check if running from main worktree
if [[ "$CURRENT_DIR" == "$MAIN_WORKTREE" ]]; then
  echo -e "${YELLOW}Warning: You're in the main worktree. This script is for setting up .worktrees/* directories.${NC}"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

# Files to copy
FILES_TO_COPY=(
  ".env.test"
  ".claude/settings.local.json"
)

# Function to copy a file
copy_file() {
  local file=$1
  local source="$MAIN_WORKTREE/$file"
  local target="$CURRENT_DIR/$file"

  # Check if source exists
  if [[ ! -f "$source" ]]; then
    echo -e "${YELLOW}⚠ Skipping $file (not found in main worktree)${NC}"
    return 0
  fi

  # Check if target already exists
  if [[ -f "$target" ]]; then
    echo -e "${YELLOW}File $file already exists${NC}"
    read -p "Overwrite? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo -e "${YELLOW}⊘ Skipped $file${NC}"
      return 0
    fi
  fi

  # Create directory if needed
  local dir="$(dirname "$target")"
  mkdir -p "$dir"

  # Copy file
  cp "$source" "$target"
  echo -e "${GREEN}✓ Copied $file${NC}"
}

# Copy all files
echo "Copying configuration files..."
for file in "${FILES_TO_COPY[@]}"; do
  copy_file "$file"
done

# Install dependencies
echo -e "\n${GREEN}Installing dependencies...${NC}"
npm install

echo -e "\n${GREEN}✓ Worktree setup complete!${NC}"
echo "Run 'npm test' to verify setup."