import WebSocket from "ws";
import { Server } from "http";

interface Data {
  type: "ECHO" | "ECHO_TIMES_3" | "ECHO_TO_ALL" | "CREATE_GROUP" | "JOIN_GROUP" | "MESSAGE_GROUP";
  value: any;
}

interface AugmentedWebSocket extends WebSocket {
  groupName: string;
}

const groupNames: string[] = [];

function createWebSocketServer(server: Server): void {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", function (webSocket: AugmentedWebSocket) {
    webSocket.on("message", function (message) {
      const data: Data = JSON.parse(message as string);

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

          wss.clients.forEach((ws: AugmentedWebSocket) => {
            if (ws.groupName === groupName) ws.send(groupMessage);
          });

          break;
        }
      }
    });
  });
}

export default createWebSocketServer;
