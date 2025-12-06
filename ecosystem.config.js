module.exports = {
  apps: [
    {
      name: 'post-master-pro',
      script: './src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        CLUSTER_ENABLED: true,
        ENABLE_QUEUE: true,
        ENABLE_SOCKETS: true,
        ENABLE_SWAGGER: true,
        ENABLE_GRAPHIQL: false,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],

  deploy: {
    production: {
      user: 'ubuntu',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'git@github.com:master-pd/post-master-pro.git',
      path: '/var/www/post-master-pro',
      'post-deploy':
        'npm install && npm run db:migrate && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};