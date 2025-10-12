# TODO: Fix 504 Gateway Timeout on Admin Products Endpoint

## Current Issue
- The `/api/admin/products` endpoint times out with 504 error.
- Cause: `downloadAndConvertExcel` downloads large Excel from Google Drive and processes each product with individual DB queries (potentially thousands), taking >60 seconds.

## Plan
- Optimize `downloadAndConvertExcel` in `Backend/services/excel.service.js` to batch DB queries instead of per-product queries.
- Preload all merchant products into a map for fast lookup.
- Optionally increase nginx proxy_read_timeout to 120s as fallback.

## Steps
- [x] Modify `downloadAndConvertExcel` to preload merchant products map.
- [x] Replace individual DB queries with map lookups.
- [x] Skipped nginx timeout increase as optimization should suffice.
- [ ] Test the endpoint to ensure it responds within timeout.
- [ ] Monitor performance and adjust cache time if necessary.

## Dependent Files
- Backend/services/excel.service.js
- nginx-config-fixed.conf (optional)

## Followup
- Deploy changes and test admin dashboard.
- If still issues, consider precomputing output.json or background updates.
