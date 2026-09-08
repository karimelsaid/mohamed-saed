export const environment = {
  production: true,
  apiBaseUrl: 'https://knoozbook.com/api',
  ssrApiBaseUrl: 'https://knoozbook.com/api',  // ← استخدم نفس API URL في production
  uploadsBaseUrl: 'https://knoozbook.com/uploads/books',
  googleClientId: '933338292435-c9bk3oo6i1oe3qkhkvp8crflmthhg0kc.apps.googleusercontent.com',
  androidGoogleClientId: '933338292435-mdpbppoua97gt3vt2bidpip89q0rjjue.apps.googleusercontent.com',
  mushafBaseUrl: 'https://knoozbook.com/uploads/mushaf_assets',
  paymentCallbackUrl: 'https://knoozbook.com/order/callback',
  // ASR Service URL for voice review (update this to actual production URL)
  asrServiceUrl: 'https://knoozbook.com'  // ← استخدم نفس domain في production
};