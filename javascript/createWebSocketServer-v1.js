import WebSocket from "ws";

function createWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", function (webSocket) {
    webSocket.on("message", function (message) {
      webSocket.send(message);
    });
  });
}

export default createWebSocketServer;
