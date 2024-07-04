import { beforeAll, afterAll, describe, test, expect } from "vitest";
import { startServer, TestWebSocket } from "./webSocketTestUtils.js";

const port = 5000 + Number(process.env.VITEST_WORKER_ID);
const url = `ws://localhost:${port}`;

describe("WebSocket Server", () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeAll(async () => {
    server = await startServer(port);
  });

  afterAll(() => {
    server.close();
  });

  test("When given an ECHO message, the server echoes the message it receives from the client", async () => {
    // Create test client
    const client = new TestWebSocket(url);
    await client.waitUntil("open");
    const testMessage = { type: "ECHO", value: "This is a test message" };

    // Send client message and check the response
    client.send(JSON.stringify(testMessage));
    await client.waitForMessage(testMessage.value);
    client.close();
  });

  test("When given an ECHO_TIMES_3 message, the server echoes the message it receives from the client 3 times", async () => {
    // Create test client
    const client = new TestWebSocket(url);
    await client.waitUntil("open");
    const testMessage = { type: "ECHO_TIMES_3", value: "This is a test message" };
    const expectedMessages = [...Array(3)].map(() => testMessage.value);

    // Send client message and check response
    client.send(JSON.stringify(testMessage));
    const messages = await client.waitForMessageCount(3);

    expect(messages).toStrictEqual(expectedMessages);
    client.close();
  });

  test("When given an ECHO_TO_ALL message, the server sends the message it receives to all clients", async () => {
    // Create test clients
    const [client1, client2, client3] = [...Array(3)].map(() => new TestWebSocket(url));
    await Promise.all([client1, client2, client3].map((c) => c.waitUntil("open")));

    // Send client message
    const testMessage = { type: "ECHO_TO_ALL", value: "This is a test message" };
    client1.send(JSON.stringify(testMessage));

    // Check the responses
    await client1.waitForMessage(testMessage.value);
    await client2.waitForMessage(testMessage.value);
    await client3.waitForMessage(testMessage.value);
    [client1, client2, client3].forEach((c) => c.close());
  });

  test("When given a MESSAGE_GROUP message, the server echoes the message it receives to everyone in the specified group", async () => {
    // Create test clients
    const [client1, client2, client3] = [...Array(3)].map(() => new TestWebSocket(url));
    await Promise.all([client1, client2, client3].map((c) => c.waitUntil("open")));

    const groupName = "TEST_GROUP";
    const testMessage = "This is a test message";

    // Have Client 1 create a group
    client1.send(JSON.stringify({ type: "CREATE_GROUP", value: groupName }));
    await client1.waitForMessage(`GROUP_CREATED: ${groupName}`);

    // Have a different client join the group
    client2.send(JSON.stringify({ type: "JOIN_GROUP", value: groupName }));
    await client2.waitForMessage(`GROUP_JOINED: ${groupName}`);

    // Then send a group message
    const groupMessage = { type: "MESSAGE_GROUP", value: { groupName, groupMessage: testMessage } };
    client2.send(JSON.stringify(groupMessage));
    await client2.waitForMessage(testMessage);
    await client1.waitForMessage(testMessage);

    // Client 3 should have received no messages
    expect(client3.messages.length).toBe(0);
    [client1, client2, client3].forEach((c) => c.close());
  });
});
