# TODO: Fix Referral System Issues

## Steps to Complete:
- [ ] Update googleSignIn in Backend/controllers/users.controller.js to handle referrals like createAccount (create Referral with 'completed', earned:5, update balance, set referredBy).
- [ ] Enhance getReferrals in Backend/controllers/users.controller.js to filter only 'completed' status and add total earned calculation.
- [ ] Update userHierarchy in Backend/controllers/admin.controller.js to populate referredId in Referral query and add direct referrals count per user.
- [ ] Add getAllReferrals function in Backend/controllers/admin.controller.js to fetch all Referrals for admin panel.
- [ ] Add route /admin/referrals in Backend/routes/admin.routes.js calling getAllReferrals.
- [ ] Test changes: Restart backend, simulate signup with referral, verify balance, hierarchy, and admin visibility.
