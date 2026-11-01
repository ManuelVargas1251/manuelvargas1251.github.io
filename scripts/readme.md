# Clean Up Old GitHub Deployments

This doc outlines how to clear historical, inactive deployment logs from your GitHub repo using the GitHub CLI (`gh`).

## Prerequisites
Ensure the GitHub CLI is installed and authenticated on your machine:
```bash
gh --version
gh auth login
```

---

## How to Run

1. Open bash terminal (Git Bash or WSL).
2. Run the script:
   ```bash
   ./scripts/cleanup-deployments.sh
   ```

**Note**: If failure occurs, try to give script execution permissions (run once):
   ```bash
   chmod +x scripts/cleanup-deployments.sh
   ```