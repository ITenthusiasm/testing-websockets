import { beforeAll, afterAll, describe, it } from "vitest";
import { startServer, TestWebSocket } from "./webSocketTestUtils-v1.js";

const port = 3000 + Number(process.env.VITEST_WORKER_ID);
const url = `ws://localhost:${port}`;

describe("WebSocket Server", () => {
  /** @type {Awaited<ReturnType<typeof startServer>>} */
  let server;

  beforeAll(async () => {
    server = await startServer(port);
  });

  afterAll(() => {
    server.close();
  });

  it("Echoes the message it receives from a client", async () => {
    // Create the test client
    const client = new TestWebSocket(url);
    await client.waitUntil("open");
    const testMessage = "This is a test message";

    // Send client message and check the response
    client.send(testMessage);
    await client.waitForMessage(testMessage);

    // Cleanup
    client.close();
  });
});
