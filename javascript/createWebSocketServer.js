import { WebSocketServer } from "ws";

/**
 * @typedef {
     | { type: "ECHO" | "ECHO_TIMES_3" | "CREATE_GROUP" | "JOIN_GROUP"; value: string }
     | { type: "MESSAGE_GROUP"; value: { groupName: string; groupMessage: string } }
   } Data
 */

/** @typedef {import("ws").WebSocket & { groupName?: string }} AugmentedWebSocket */

/** @type {Set<string>} */
const groupNames = new Set();

/**
 * Creates a WebSocket server from a Node http server. The server must be started externally.
 * @param {import("node:http").Server} server The http server from which to create the WebSocket server.
 * @returns {void}
 */
function createWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on(
    "connection",
    /** @param {AugmentedWebSocket} webSocket */ (webSocket) => {
      webSocket.on("message", (message) => {
        /** @type {Data} */
        const data = JSON.parse(message.toString("utf8"));

        switch (data.type) {
          case "ECHO": {
            webSocket.send(data.value);
            break;
          }
          case "ECHO_TIMES_3": {
            for (let i = 1; i <= 3; i++) webSocket.send(data.value);
            break;
          }
          case "CREATE_GROUP": {
            const groupName = data.value;
            if (groupNames.has(groupName)) return webSocket.send(`GROUP_UNAVAILABLE: ${groupName}`);

            groupNames.add(groupName);
            webSocket.groupName = groupName;
            webSocket.send(`GROUP_CREATED: ${groupName}`);
            break;
          }
          case "JOIN_GROUP": {
            const groupName = data.value;
            if (!groupNames.has(groupName)) return webSocket.send(`GROUP_UNAVAILABLE: ${groupName}`);

            webSocket.groupName = groupName;
            webSocket.send(`GROUP_JOINED: ${groupName}`);
            break;
          }
          case "MESSAGE_GROUP": {
            const { groupName, groupMessage } = data.value;
            if (webSocket.groupName !== groupName) return;

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
