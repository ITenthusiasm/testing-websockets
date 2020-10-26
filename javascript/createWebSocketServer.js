import WebSocket from "ws";

const groupNames = [];

function createWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", function (webSocket) {
    webSocket.on("message", function (message) {
      const data = JSON.parse(message);

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

          wss.clients.forEach((ws) => {
            if (ws.groupName === groupName) ws.send(groupMessage);
          });

          break;
        }
      }
    });
  });
}

export default createWebSocketServer;
