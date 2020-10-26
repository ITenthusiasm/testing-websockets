import http, { Server } from "http";
import WebSocket, { Data } from "ws";
import createWebSocketServer from "./createWebSocketServer";

/**
 * Creates and starts a WebSocket server from a simple http server for testing purposes.
 * @param {number} port Port for the server to listen on
 * @returns {Promise<Server>} The created server
 */
function startServer(port) {
  const server = http.createServer();
  createWebSocketServer(server);

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

/**
 * Forces a process to wait until the socket's `readyState` becomes the specified value.
 * @param {number} socket The socket whose `readyState` is being watched
 * @param {number} state The desired `readyState` for the socket
 */
function waitForSocketState(socket, state) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      if (socket.readyState === state) {
        resolve();
      } else {
        waitForSocketState(socket, state).then(resolve);
      }
    });
  });
}

/**
 * Creates a socket client that connects to the specified `port`. If `closeAfter`
 * is specified, the client automatically closes the socket after it receives
 * the specified number of messages.
 * @param {number} port The port to connect to on the localhost
 * @param {number} [closeAfter] The number of messages to receive before closing the socket
 * @returns {Promise<[WebSocket, Data]>} Tuple containing the created client and any messages it receives
 */
async function createSocketClient(port, closeAfter) {
  const client = new WebSocket(`ws://localhost:${port}`);
  await waitForSocketState(client, client.OPEN);
  const messages = [];

  client.on("message", (data) => {
    messages.push(data);

    if (messages.length === closeAfter) {
      client.close();
    }
  });

  return [client, messages];
}

export { startServer, waitForSocketState, createSocketClient };
