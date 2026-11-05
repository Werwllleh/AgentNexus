module.exports = {
  apps: [
    {
      name: 'gemini-hub',
      script: 'server/src/index.js',
      cwd: '/home/alex/apps/project-management',
      env: {
        NODE_ENV: 'production',
        PORT: 3050,
        APPS_DIR: '/home/alex/apps'
      }
    }
  ]
};
