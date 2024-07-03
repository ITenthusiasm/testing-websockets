import { beforeAll, afterAll, describe, test, expect } from "vitest";
import { startServer, waitForSocketState, createSocketClient } from "./webSocketTestUtils-v1.js";

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
    const [client, messages] = await createSocketClient(port, 1);
    const testMessage = "This is a test message";

    // Send client message
    client.send(testMessage);

    // Perform assertions on the response
    await waitForSocketState(client, client.CLOSED);

    const [responseMessage] = messages;
    expect(responseMessage).toBe(testMessage);
  });
});
