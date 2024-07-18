import { beforeAll, afterAll, describe, test, expect } from "vitest";
import WebSocket from "ws";
import { startServer, waitForSocketState } from "./webSocketTestUtils-v1.js";

const port = 5000 + Number(process.env.VITEST_WORKER_ID);

describe("WebSocket Server", () => {
  /** @type {Awaited<ReturnType<typeof startServer>>} */
  let server;

  beforeAll(async () => {
    server = await startServer(port);
  });

  afterAll(() => {
    server.close();
  });

  test("Server echoes the message it receives from client", async () => {
    // Create test client
    const client = new WebSocket(`ws://localhost:${port}`);
    await waitForSocketState(client, client.OPEN);

    const testMessage = "This is a test message";
    let responseMessage;

    client.on("message", (data) => {
      responseMessage = data.toString("utf8");

      // Close the client after it receives the response
      client.close();
    });

    // Send client message
    client.send(testMessage);

    // Perform assertions on the response
    await waitForSocketState(client, client.CLOSED);
    expect(responseMessage).toBe(testMessage);
  });
});
