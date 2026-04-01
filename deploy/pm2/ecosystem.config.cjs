/**
 * PM2 example — copy to the server, set cwd, then:
 *   pm2 start ecosystem.config.cjs
 * Load secrets via `source /etc/crm.env` before start, or use `pm2 start` with `--update-env`
 * and export variables in the shell profile / systemd EnvironmentFile.
 */
module.exports = {
  apps: [
    {
      name: 'crm-api',
      cwd: '/opt/servicesphere/server',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production', PORT: 4000 },
    },
    {
      name: 'crm-worker',
      cwd: '/opt/servicesphere/server',
      script: 'worker.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
  ],
}
