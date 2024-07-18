import { beforeAll, afterAll, describe, it, expect } from "vitest";
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
    // 1) Create the test client
    const client = new TestWebSocket(url);
    await client.waitUntil("open");
    const testMessage = "This is a test message";

    const responseMessage = await new Promise((resolve) => {
      client.addEventListener("message", ({ data }) => resolve(data.toString("utf8")), { once: true });

      // 2) Send a client message to the server
      client.send(testMessage);
    });

    // 3) Perform assertions on the response message that the client receives
    expect(responseMessage).toBe(testMessage);

    // 4) Close the client when everything is done
    client.close();
  });
});
