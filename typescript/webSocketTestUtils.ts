import http, { Server } from "http";
import WebSocket from "ws";
import createWebSocketServer from "./createWebSocketServer.js";

/**
 * Creates and starts a WebSocket server from a simple http server for testing purposes.
 * @param port Port for the server to listen on
 * @returns The created server
 */
function startServer(port: number): Promise<Server> {
  const server = http.createServer();
  createWebSocketServer(server);

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

/**
 * Forces a process to wait until the socket's `readyState` becomes the specified value.
 * @param socket The socket whose `readyState` is being watched
 * @param state The desired `readyState` for the socket
 */
function waitForSocketState(socket: WebSocket, state: number): Promise<void> {
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
 * Creates a socket client that connects to the specified `port`.
 * @param port The port to connect to on the localhost
 * @returns Tuple containing the created client and any messages it receives
 */
async function createSocketClient(port: number): Promise<[WebSocket, string[]]>;

/**
 * Creates a socket client that connects to the specified `port`. The client automatically
 * closes its socket after it receives the specified number of messages.
 * @param port The port to connect to on the localhost
 * @param closeAfter The number of messages to receive before closing the socket
 * @returns Tuple containing the created client and any messages it receives
 */
async function createSocketClient(port: number, closeAfter: number): Promise<[WebSocket, string[]]>;

async function createSocketClient(
  port: number,
  closeAfter?: number
): Promise<[WebSocket, string[]]> {
  const client = new WebSocket(`ws://localhost:${port}`);
  await waitForSocketState(client, client.OPEN);
  const messages: string[] = [];

  client.on("message", (data) => {
    messages.push(data.toString("utf8"));

    if (messages.length === closeAfter) {
      client.close();
    }
  });

  return [client, messages];
}

export { startServer, waitForSocketState, createSocketClient };
