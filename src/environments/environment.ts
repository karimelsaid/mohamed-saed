export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  uploadsBaseUrl: 'http://localhost:3000/uploads/books',
  ssrApiBaseUrl: 'http://localhost:3000/api',  // ← للاستخدام المحلي
  googleClientId: '933338292435-c9bk3oo6i1oe3qkhkvp8crflmthhg0kc.apps.googleusercontent.com',
  androidGoogleClientId: '933338292435-br4gba7k8tu2518q5dghkkj9meilirb6.apps.googleusercontent.com',
  mushafBaseUrl: 'https://knoozbook.com/uploads/mushaf_assets',
  // Always use the production domain for Kashier callback (Kashier rejects localhost)
  paymentCallbackUrl: 'https://knoozbook.com/order/callback',
  // ASR Service URL for voice review
  asrServiceUrl: 'http://localhost:8000'
};
