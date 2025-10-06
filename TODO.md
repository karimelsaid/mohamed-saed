# TODO: Modify Favorites and Cart Icons Behavior

## Plan
- Modify the behavior of favorite and cart icons in search-results component to navigate to /research?filter=all&showFirst=true when clicked.
- Add border to the favorite and cart icons without affecting existing design.
- Update search-results component to show only the first item when showFirst=true.

## Steps
- [x] Edit src/app/search-results/search-results.component.ts:
  - Add showFirst property and read from query params in ngOnInit.
  - Modify addToFavorites and addToCart functions to navigate to /research?filter=all&showFirst=true.
  - Update updatePage method to limit paginatedBooks to first item if showFirst is true.
- [x] Edit src/app/search-results/search-results.component.html:
  - Add border style/class to the favorite and cart icons.

## Follow-up
- [x] Verify navigation to /research?filter=all&showFirst=true works.
- [x] Verify only first item is shown when showFirst=true.
- [x] Verify border styles on icons without affecting design.
- [x] Update tutorial service to navigate to /research?filter=all&showFirst=true and highlight the first book card for cart-favorites step.
- [x] Clean up URL by removing &showFirst=true when tutorial window closes (next step or skip).
- [x] Revert favorite and cart button behavior back to original functionality (add to favorites/cart instead of navigation).
