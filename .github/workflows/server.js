const http = require("http");
const fs = require("fs");
const path = require("path");

const startingPort = Number(process.env.PORT || 5173);
const host = "127.0.0.1";
const maxPortAttempts = 25;
const root = __dirname;
const logPath = path.join(root, "server.out.log");
const liveServers = [];

function log(message) {
  const line = `${message}\n`;
  fs.appendFileSync(logPath, line);
  console.log(message);
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function createServer() {
  return http.createServer((request, response) => {
    const requestedPath = request.url === "/" ? "/index.html" : request.url;
    const cleanPath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(root, cleanPath);

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(data);
    });
  });
}

function listen(port, attempt = 1) {
  const server = createServer();
  liveServers.push(server);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && attempt < maxPortAttempts) {
      const nextPort = port + 1;
      console.log(`Port ${port} is already in use. Trying ${nextPort}...`);
      listen(nextPort, attempt + 1);
      return;
    }

    console.error(`Unable to start Cloud Dictionary on port ${port}.`);
    console.error(error.message);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    log(`Cloud Dictionary is running at http://localhost:${port}`);
    log("Keep this terminal open while using the app.");
  });
}

listen(startingPort);
