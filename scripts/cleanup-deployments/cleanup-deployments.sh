#!/usr/bin/env bash
# Set repo name
REPO="ManuelVargas1251/manuelvargas1251.github.io"

echo "Starting deployment cleanup..."

# Fetch all deployment IDs
# tail -n +2: skips the latest/active deployment
IDS=$(gh api --method GET "repos/$REPO/deployments?per_page=100" --jq '.[].id' | tail -n +2)

for ID in $IDS; do
    echo "Deactivating and deleting deployment ID: $ID"
    
    # 1. Set deployment status to inactive
    gh api --method POST "repos/$REPO/deployments/$ID/statuses" -f state=inactive > /dev/null 2>&1
    
    # 2. Delete the deployment record
    gh api --method DELETE "repos/$REPO/deployments/$ID"
done

echo "Deployment cleanup complete!"