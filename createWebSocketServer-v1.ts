import WebSocket from "ws";
import { Server } from "http";

function createWebSocketServer(server: Server): void {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", function (webSocket) {
    webSocket.on("message", function (message) {
      webSocket.send(message);
    });
  });
}

export default createWebSocketServer;
