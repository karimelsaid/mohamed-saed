# TODO: Fix Upload Path in Merchant Controller

## Completed Tasks
- [x] Fixed upload path in `updateMerchantProfile` function from `../../uploads/books` to `../uploads/books`
- [x] Verified no other instances of incorrect paths in JavaScript files
- [x] Confirmed admin paths in excel.service.js are intentionally different

## Summary
The issue was in the `updateMerchantProfile` function where the path to the uploads directory was incorrectly set to `../../uploads/books` instead of `../uploads/books`. This has been corrected to ensure proper file path resolution from the Backend/controllers/ directory.
