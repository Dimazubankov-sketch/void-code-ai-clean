// Конфиг PM2 для бэкенда Void Code AI.
// Запуск (один раз, на сервере): pm2 start ecosystem.config.js
// После этого деплой-скрипт просто делает: pm2 restart void-code-api
module.exports = {
  apps: [
    {
      name: 'void-code-api',
      cwd: __dirname,
      script: 'dist/main.js',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
    },
  ],
};
