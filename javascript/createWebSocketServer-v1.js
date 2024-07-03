import { WebSocketServer } from "ws";
import { Server } from "http";

/**
 * Creates a WebSocket server from a Node http server. The server must
 * be started externally.
 * @param {Server} server The http server from which to create the WebSocket server
 */
function createWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", function (webSocket) {
    webSocket.on("message", function (message) {
      webSocket.send(message);
    });
  });
}

export default createWebSocketServer;
