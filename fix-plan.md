# Fix Plan for Account Creation Issues

## Issue 1: Merchant Account Creation Error
**Problem**: Generic error message "حدث خطأ أثناء إنشاء الحساب" without specific details
**Root Cause**: Backend validation errors not properly communicated to frontend

## Issue 2: Buyer Account Register Button Disabled  
**Problem**: Register button remains disabled despite valid data
**Root Cause**: Form validation state not properly updating button enable/disable logic

## Files to Fix:

### Backend:
- [ ] Backend/controllers/merchant.controller.js - Improve error handling
- [ ] Backend/controllers/users.controller.js - Improve error messages

### Frontend:
- [ ] src/app/auth/register/register.component.ts - Fix button enable logic
- [ ] src/app/auth/register/register.component.html - Update validation display
- [ ] src/app/merchant/merchant-registration.component.ts - Fix error handling
