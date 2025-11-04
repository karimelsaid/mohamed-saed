# Fix Duplicate Products in Merchant Dashboard

## Completed Tasks
- [x] Analyze the issue: Merchants seeing duplicate products in their dashboard
- [x] Identify the root cause: Deduplication logic in getMerchantProducts was based on product_image (barcode), but duplicates might have same name/category
- [x] Update deduplication logic: Change to remove duplicates based on product_name + product_category, keeping the latest
- [x] Edit Backend/controllers/merchant.controller.js to implement the fix

## Next Steps
- [ ] Test the fix by checking if duplicates are removed in merchant dashboard
- [ ] If needed, apply similar fix to admin controller for consistency
