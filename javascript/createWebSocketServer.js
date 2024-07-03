import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";

/**
 * @typedef {Object} Data
 * @property {"ECHO" | "ECHO_TIMES_3" | "ECHO_TO_ALL" | "CREATE_GROUP" | "JOIN_GROUP" | "MESSAGE_GROUP"} type
 * @property {any} value
 */

/** @typedef {WebSocket & { groupName: string}} AugmentedWebSocket */

/** @type {string[]} */
const groupNames = [];

/**
 * Creates a WebSocket server from a Node http server. The server must
 * be started externally.
 * @param {Server} server The http server from which to create the WebSocket server
 */
function createWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on(
    "connection",
    /** @param {AugmentedWebSocket} webSocket */ function (webSocket) {
      webSocket.on("message", function (message) {
        /** @type {Data} */
        const data = JSON.parse(message.toString("utf8"));

        switch (data.type) {
          case "ECHO": {
            webSocket.send(data.value);
            break;
          }
          case "ECHO_TIMES_3": {
            for (let i = 1; i <= 3; i++) {
              webSocket.send(data.value);
            }
            break;
          }
          case "ECHO_TO_ALL": {
            wss.clients.forEach((ws) => ws.send(data.value));
            break;
          }
          case "CREATE_GROUP": {
            const groupName = data.value;

            if (!groupNames.find((gn) => gn === groupName)) {
              groupNames.push(groupName);
              webSocket.groupName = groupName;
              webSocket.send(groupName);
            } else {
              webSocket.send("GROUP_UNAVAILABLE");
            }

            break;
          }
          case "JOIN_GROUP": {
            const groupName = data.value;

            if (!groupNames.find((gn) => gn === groupName)) {
              webSocket.send("GROUP_UNAVAILABLE");
            } else {
              webSocket.groupName = groupName;
              webSocket.send(groupName);
            }

            break;
          }
          case "MESSAGE_GROUP": {
            const { groupName, groupMessage } = data.value;
            if (webSocket.groupName !== groupName) break;

            /** @type {Set<AugmentedWebSocket>} */ (wss.clients).forEach((ws) => {
              if (ws.groupName === groupName) ws.send(groupMessage);
            });

            break;
          }
        }
      });
    }
  );
}

export default createWebSocketServer;
