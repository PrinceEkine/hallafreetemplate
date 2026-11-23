# One-shot backend setup: migrations + push fan-out. Run from the repo root.
# Prerequisites (once per machine):
#   npm install -g supabase
#   supabase login
$ErrorActionPreference = 'Stop'
$projectRef = 'eatxkfopyljdomzbhzym'

Write-Host '==> Linking project...'
supabase link --project-ref $projectRef

Write-Host '==> Pushing migrations...'
supabase db push --remote --yes

Write-Host '==> Deploying push-fanout...'
$secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
supabase secrets set --yes FANOUT_SECRET=$secret
supabase functions deploy push-fanout --use-api --yes

Write-Host ''
Write-Host '==> Last step: store the fan-out secret (one line).'
Write-Host 'The migration seeds the function URL into public.app_settings;'
Write-Host 'paste this into the Supabase dashboard SQL Editor and Run:'
Write-Host ''
Write-Host "update public.app_settings set value = '$secret', updated_at = now() where key = 'fanout_secret';"
Write-Host ''
Write-Host 'Done. Push triggers go live once the secret row is set.'
