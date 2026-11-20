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
      },
    },
  ],
};
