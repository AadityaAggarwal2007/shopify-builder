// PM2 app for the VPS. ShipTrack (`tracker`) owns port 3000; Builder runs beside it on 3001.
// One instance (fork mode): the login lockout and the OAuth nonces live in memory.
module.exports = {
  apps: [
    {
      name: 'builder',
      script: 'node_modules/.bin/next',
      args: 'start -p 3001',
      cwd: '/var/www/builder',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env_production: { NODE_ENV: 'production', PORT: 3001 },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '5s',
      out_file: '/var/log/builder-out.log',
      error_file: '/var/log/builder-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
