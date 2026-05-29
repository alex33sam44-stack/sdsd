# Stage 6 recheck summary

Added a consolidated public launch gate:

- `selfhost/scripts/public-launch-check.sh`
- `npm run verify:public-launch`
- `release-evidence/public-launch/public-launch-check-latest.json`

The gate intentionally fails until the VPS has real production configuration and passed runtime evidence. This prevents accidentally sharing a public URL based on placeholder configuration or unverified evidence.
