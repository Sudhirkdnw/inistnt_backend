module.exports = {
  apps: [
    {
      name: 'hykee-api',
      script: 'server.js',
      instances: 1, // Reduced from 'max' to 1 to prevent memory exhaustion and server slowdown
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      combine_logs: true,
      merge_logs: true,
    },
  ],
};
