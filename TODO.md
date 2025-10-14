# TODO: Add Post Office Shipping Option

## Tasks
- [x] Add `isPostOffice` boolean property to TS component
- [x] Add `postOfficeName` string property to TS component
- [x] Update `onDeliveryTypeChange` to reset address confirmation on type change
- [x] Modify `calculateShippingCost` to use `post_office_cost` when `isPostOffice` is true
- [x] Update `isAddressComplete` getter to validate `postOfficeName` when `isPostOffice`
- [ ] Add third radio button for "شحن عبر مكاتب البريد" in HTML
- [ ] Add input field for post office name in HTML when post office option is selected
- [x] Update `submitOrder` to include `postOfficeName` in order data
- [ ] Test the new shipping option functionality
