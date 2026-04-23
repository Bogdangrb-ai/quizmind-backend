import http from "http";

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, message: "minimal ok" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`HTTP server pornit pe portul ${port}`);
});
