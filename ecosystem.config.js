module.exports = {
  apps: [
    {
      name: 'bot-next',
      script: './node_modules/.bin/next',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G', // Restart if exceeds 2GB
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=4096', // 4GB heap
        PORT: 3000,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Auto-restart strategies
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
    {
      name: 'bot-genkit',
      script: './node_modules/.bin/genkit',
      args: 'start -- tsx src/ai/dev.ts',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=2048', // 2GB heap
        PORT: 8000,
      },
      error_file: './logs/genkit-err.log',
      out_file: './logs/genkit-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
  // Cluster mode for load balancing (if needed later)
  // exec_mode: 'cluster',
  // instances: 2,
  
  // Monitoring
  monitor_interval: 5000, // Check memory every 5s
};
