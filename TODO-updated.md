# TODO: Add Admin Merchant Management and Merchant Dashboard

## Backend Tasks
- [x] Admin controller functions already exist (listMerchants, updateMerchantApproval, listMerchantProducts, updateProductApproval)
- [x] Add PATCH route for product approval in admin.routes.js
- [x] Add suspended field to User model
- [x] Add updateMerchantSuspension function to admin controller
- [x] Add PATCH route for merchant suspension in admin.routes.js
- [x] Update merchant login to check suspended status
- [x] Update merchant auth service to check suspended status
- [x] Update listMerchants to include suspended field
- [ ] Test backend APIs for merchant and product management

## Frontend Tasks
- [x] Create admin merchant management page component (list pending merchants, approve/reject)
- [x] Create admin product approval page component (list pending products, approve/reject)
- [x] Add merchant management and product approval buttons to admin dashboard
- [x] Add display sections for merchant management and product approval in admin dashboard
- [x] Fix TypeScript errors and module declarations for admin dashboard
- [x] Import AdminModule in AppModule
- [x] Configure FontAwesome icons in main.ts
- [x] Create merchant dashboard page component (overview for merchant)
- [x] Create merchant add product form component - COMPLETED (modern UI design with validation and user-friendly interface)
- [x] Create merchant products list component (integrated into dashboard)
- [x] Create merchant orders list component (integrated into dashboard)
- [x] Update Angular routing to include new pages (/admin/merchants, /admin/products, /merchant/dashboard)
- [ ] Update navbar or menu to include links for admin and merchant based on user role
- [x] Create services for admin and merchant API calls
- [x] Fix merchant login to use proper JWT token authentication
- [x] Fix merchant dashboard data loading issues (merchant data, products, orders)
- [x] Add suspend/activate merchant functionality to admin merchant management component
- [x] Update admin service to include updateMerchantSuspension method
- [x] Update merchant auth service to check suspended status
- [x] Update merchant auth guard to handle suspended merchants
- [x] Allow suspended merchants to login but redirect to home page instead of dashboard
- [x] Remove suspension warning message from merchant dashboard UI
- [ ] Test frontend pages and integration with backend

## General Tasks
- [x] Ensure proper authentication and role-based access for admin and merchant routes (MerchantAuthGuard implemented and logout fixed)
- [x] Handle UI feedback for approvals/rejections (success/error messages)
- [x] Add loading states and error handling in components
- [x] Fix unified logout for merchants (logout from both merchant and user sessions)
- [x] Fix merchant data display in account modal (show name, email, phone correctly)
- [x] Fix merchant approval status sync between admin approval and merchant account modal/dashboard

## Recent Updates
- [x] Enhanced merchant add-product component with modern UI design, improved validation, and user-friendly interface
- [x] Added pendingProductsCount getter to merchant dashboard component
- [x] Improved dashboard UI with better styling and responsive design
- [x] Fixed merchant registration date display issue by adding createdAt field to API response
