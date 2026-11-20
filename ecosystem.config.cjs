module.exports = {
  apps: [
    {
      name: 'jojo-tcg',
      script: './server.mjs',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 5001,
        HOST: '0.0.0.0',
        DB_HOST: '127.0.0.1',
        DB_PORT: 3306,
        DB_USER: 'jojotcg',
        DB_PASSWORD: 'jojotcg_secret_2026',
        DB_NAME: 'jojotcg',
      },
    },
  ],
};
