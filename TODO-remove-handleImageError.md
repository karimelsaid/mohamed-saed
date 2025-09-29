# TODO: Remove handleImageError since all images are now webp

## Current Status
- [x] Analyzed files using search_code and search_files
- [x] Read relevant .ts and .html files for understanding
- [x] Created detailed plan based on findings
- [x] User approved the plan

## Steps to Complete

### 1. Update TypeScript Files (.ts) - Remove handleImageError function
- [ ] src/app/home-page/home-page.component.ts: Remove the entire `handleImageError` method
- [ ] src/app/favorites/favorites.component.ts: Remove `handleImageError`
- [ ] src/app/checkout-modal/checkout-modal.component.ts: Remove `handleImageError`
- [ ] src/app/cart/cart.component.ts: Remove `handleImageError`
- [ ] src/app/book-list/tatwer/tatwer.component.ts: Remove `handleImageError`
- [ ] src/app/book-list/child/child.component.ts: Remove `handleImageError`
- [ ] src/app/book-list/rewayat/rewayat.component.ts: Remove `handleImageError`
- [ ] src/app/book-list/qamos/qamos.component.ts: Remove `handleImageError`
- [ ] src/app/book-list/tarekh/tarekh.component.ts: Remove `handleImageError`
- [ ] src/app/book-list/islamic/islamic.component.ts: Remove `handleImageError`
- [ ] src/app/book-list/fit/fit.component.ts: Remove `handleImageError`
- [ ] src/app/book-list/fenon/fenon.component.ts: Remove `handleImageError`
- [ ] src/app/book-list/aamal/aamal.component.ts: Remove `handleImageError`
- [ ] src/app/merchant/dashboard/dashboard.component.ts: Remove `handleImageError`
- [ ] src/app/admin/admin-dashboard/admin-dashboard.component.ts: Remove `handleImageError`

### 2. Update HTML Files (.html) - Update img src to .webp and remove (error)
- [ ] src/app/home-page/home-page.component.html: Change `.jpg` to `.webp` in img src, remove `(error)="handleImageError($event, book)"`
- [ ] src/app/favorites/favorites.component.html: Remove `(error)="handleImageError($event)"`
- [ ] src/app/checkout-modal/checkout-modal.component.html: Change `.jpg` to `.webp`, remove `(error)="handleImageError($event)"`
- [ ] src/app/cart/cart.component.html: Change `.jpg` to `.webp` in fallback src, remove `(error)="handleImageError($event)"`
- [ ] src/app/book-list/tatwer/tatwer.component.html: Change `.jpg` to `.webp`, remove `(error)="handleImageError($event, book)"`
- [ ] src/app/book-list/child/child.component.html: Change `.jpg` to `.webp` in fallback, remove `(error)="handleImageError($event)"`
- [ ] src/app/book-list/rewayat/rewayat.component.html: Change `.jpg` to `.webp`, remove `(error)="handleImageError($event)"`
- [ ] src/app/book-list/qamos/qamos.component.html: Change `.jpg` to `.webp`, remove `(error)="handleImageError($event)"`
- [ ] src/app/book-list/tarekh/tarekh.component.html: Change `.jpg` to `.webp`, remove `(error)="handleImageError($event)"`
- [ ] src/app/book-list/islamic/islamic.component.html: Change `.jpg` to `.webp`, remove `(error)="handleImageError($event)"`
- [ ] src/app/book-list/fit/fit.component.html: Change `.jpg` to `.webp`, remove `(error)="handleImageError($event)"`
- [ ] src/app/book-list/fenon/fenon.component.html: Change `.jpg` to `.webp`, remove `(error)="handleImageError($event)"`
- [ ] src/app/book-list/aamal/aamal.component.html: Remove `(error)="handleImageError($event, book)"`
- [ ] src/app/merchant/dashboard/dashboard.component.html: Remove `(error)` bindings
- [ ] src/app/admin/admin-dashboard/admin-dashboard.component.html: Remove `(error)="handleImageError($event)"` from img tags

### 3. Followup Steps
- [ ] Run `ng serve` and test image loading in affected pages (home, favorites, cart, book lists, merchant dashboard, admin dashboard)
- [ ] Check browser console for any image loading errors
- [ ] Verify all images display correctly without fallbacks
- [ ] Update this TODO file with completion status
- [ ] Mark task as complete in main TODO.md if exists

## Notes
- Changes are isolated to individual components; no global dependencies.
- After all edits, no need for new imports or package updates.
- If any file doesn't have the exact function or binding, skip or adjust accordingly.
