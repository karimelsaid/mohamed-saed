module.exports = {
  apps: [
    {
      name: 'kenouz-backend',
      script: 'app.js',
      cwd: __dirname,
      instances: 'max', // استخدم جميع الأنوية
      exec_mode: 'cluster', // لتوزيع الحمل
      watch: false, // الأفضل غلقه في الإنتاج
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        SITEMAP_BASE_URL: 'http://localhost:3000'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        SITEMAP_BASE_URL: 'https://knoozbook.com'
      }
    }
  ]
};
