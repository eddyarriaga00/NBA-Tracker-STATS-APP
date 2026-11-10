#!/bin/bash
# Switches on "Continue with GitHub" for NBA Tracker in Supabase.
# Run it yourself: it asks for the GitHub OAuth app's Client ID and client
# secret (the secret is hidden as you paste it) and sends them straight to
# Supabase. Nothing is saved to a file or printed.
#
# First make the OAuth app at https://github.com/settings/developers
#   Homepage URL:  https://eddyarriaga00.github.io/NBA-Tracker-STATS-APP/
#   Callback URL:  https://ixuimpifuacohrotchvr.supabase.co/auth/v1/callback
set -euo pipefail
REF="ixuimpifuacohrotchvr"

echo "GitHub sign-in for NBA Tracker"
echo "Callback URL for the GitHub OAuth app:"
echo "  https://$REF.supabase.co/auth/v1/callback"
echo
read -r -p "GitHub Client ID: " CLIENT_ID
read -r -s -p "GitHub client secret (hidden, paste and press Enter): " CLIENT_SECRET
echo
if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then echo "Both are needed. Nothing was changed."; exit 1; fi

# The Supabase CLI's saved login (from `supabase login`), read from the Mac keychain.
TOKEN="${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -s "Supabase CLI" -a supabase -w 2>/dev/null || true)}"
case "$TOKEN" in go-keyring-base64:*) TOKEN="$(printf '%s' "${TOKEN#go-keyring-base64:}" | base64 --decode)";; esac
if [ -z "$TOKEN" ]; then echo "Not logged in to Supabase. Run: npx supabase login"; exit 1; fi

STATUS=$(CLIENT_ID="$CLIENT_ID" CLIENT_SECRET="$CLIENT_SECRET" python3 -c '
import json, os
print(json.dumps({"external_github_enabled": True, "external_github_client_id": os.environ["CLIENT_ID"].strip(), "external_github_secret": os.environ["CLIENT_SECRET"].strip()}))
' | curl -s -o /dev/null -w '%{http_code}' -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data @-)
unset CLIENT_SECRET TOKEN

if [ "$STATUS" = "200" ]; then
  echo "Done. GitHub sign-in is on. Reopen the app and the button will be there."
else
  echo "Supabase answered $STATUS, so nothing was changed. Check the Client ID and secret and try again."
  exit 1
fi
