#!/bin/bash
# Quick audit of all running paid services
# Run: ./scripts/cost-audit.sh

echo "═══════════════════════════════════════"
echo "  INFRASTRUCTURE COST AUDIT"
echo "═══════════════════════════════════════"
echo ""

echo "▸ RENDER SERVICES"
render services list --output json 2>/dev/null | python3 -c "
import sys, json
try:
    for s in json.load(sys.stdin):
        svc = s if 'name' in s else s.get('service', s)
        name = svc.get('name', '?')
        suspended = svc.get('suspended', '?')
        plan = svc.get('serviceDetails', {}).get('plan', '?')
        status = '💤 suspended' if suspended == 'suspended' else '🔴 RUNNING (billing)'
        print(f'  {name:35s} {plan:10s} {status}')
except: print('  (could not fetch — check dashboard)')
" 2>/dev/null || echo "  (render CLI not authenticated)"

echo ""
echo "▸ RAILWAY SERVICES"
railway service status 2>/dev/null || echo "  (railway CLI not authenticated)"

echo ""
echo "▸ VERCEL"
cd web 2>/dev/null && npx vercel ls 2>/dev/null | head -5 || echo "  (check vercel.com/dashboard)"
cd .. 2>/dev/null

echo ""
echo "▸ REMINDERS"
echo "  Check manually:"
echo "  - Neon DB:      console.neon.tech → Billing"
echo "  - Google Cloud:  console.cloud.google.com → Billing"
echo "  - Vapi:         dashboard.vapi.ai → Billing"
echo ""
echo "═══════════════════════════════════════"
