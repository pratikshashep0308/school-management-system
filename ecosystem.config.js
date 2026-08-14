module.exports = {
  apps: [
    {
      name: "school-backend",
      script: "server.js",
      cwd: "C:/Users/Admin/Desktop/school-management-systems/backend",
    },
    {
      name: "school-frontend",
      script: "C:/Users/Admin/AppData/Roaming/npm/node_modules/serve/build/main.js",
      args: "-s . -l 3000",
      cwd: "C:/Users/Admin/Desktop/school-management-systems/frontend/build",
    },
  ],
};