module.exports = {
  apps: [
    {
      name: 'kenouz-backend',
      script: 'app.js',
      cwd: __dirname,
      // IMPORTANT: Use 'fork' not 'cluster' for Angular SSR.
      // Cluster mode causes issues with dynamic ESM imports (server.mjs)
      // and causes SSR requests to hang indefinitely.
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1500M',
      node_args: '--max-old-space-size=2048',
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
