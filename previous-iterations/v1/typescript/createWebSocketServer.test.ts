import { beforeAll, afterAll, describe, test, expect } from "vitest";
import { startServer, waitForSocketState, createSocketClient } from "./webSocketTestUtils.js";

const port = 3000 + Number(process.env.VITEST_WORKER_ID);

describe("WebSocket Server", () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeAll(async () => {
    server = await startServer(port);
  });

  afterAll(() => {
    server.close();
  });

  test("When given an ECHO message, the server echoes the message it receives from client", async () => {
    // Create test client
    const [client, messages] = await createSocketClient(port, 1);
    const testMessage = { type: "ECHO", value: "This is a test message" };

    // Send client message
    client.send(JSON.stringify(testMessage));

    // Perform assertions on the response
    await waitForSocketState(client, client.CLOSED);

    const [responseMessage] = messages;
    expect(responseMessage).toBe(testMessage.value);
  });

  test("When given an ECHO_TIMES_3 message, the server echoes the message it receives from client 3 times", async () => {
    // Create test client
    const [client, messages] = await createSocketClient(port, 3);
    const testMessage = { type: "ECHO_TIMES_3", value: "This is a test message" };
    const expectedMessages = [...Array(3)].map(() => testMessage.value);

    // Send client message
    client.send(JSON.stringify(testMessage));

    // Perform assertions on the response
    await waitForSocketState(client, client.CLOSED);

    expect(messages).toStrictEqual(expectedMessages);
    expect(messages.length).toBe(3);
  });

  test("When given an ECHO_TO_ALL message, the server sends the message it receives to all clients", async () => {
    // Create test clients
    const [client1, messages1] = await createSocketClient(port, 1);
    const [client2, messages2] = await createSocketClient(port, 1);
    const [client3, messages3] = await createSocketClient(port, 1);
    const testMessage = { type: "ECHO_TO_ALL", value: "This is a test message" };

    // Send client message
    client1.send(JSON.stringify(testMessage));

    // Perform assertions on the responses
    await waitForSocketState(client1, client1.CLOSED);
    await waitForSocketState(client2, client2.CLOSED);
    await waitForSocketState(client3, client3.CLOSED);

    expect(messages1[0]).toBe(testMessage.value);
    expect(messages2[0]).toBe(testMessage.value);
    expect(messages3[0]).toBe(testMessage.value);
  });

  test("When given a MESSAGE_GROUP message, the server echoes the message it receives to everyone in the specified group", async () => {
    // Create test clients
    const [client1, messages1] = await createSocketClient(port);
    const [client2, messages2] = await createSocketClient(port, 2);
    const [client3, messages3] = await createSocketClient(port);
    const creationMessage = { type: "CREATE_GROUP", value: "TEST_GROUP" };
    const testMessage = "This is a test message";

    // Setup test clients to send messages and close in the right order
    client1.on("message", (rawData) => {
      const data = rawData.toString("utf8");
      if (data === creationMessage.value) {
        const joinMessage = { type: "JOIN_GROUP", value: data };
        const groupMessage = {
          type: "MESSAGE_GROUP",
          value: { groupName: data, groupMessage: testMessage },
        };

        client2.send(JSON.stringify(joinMessage));
        client2.send(JSON.stringify(groupMessage));
      }
    });

    client2.on("close", () => {
      client1.close();
      client3.close();
    });

    // Send client message
    client1.send(JSON.stringify(creationMessage));

    // Perform assertions on the responses
    await waitForSocketState(client1, client1.CLOSED);
    await waitForSocketState(client2, client2.CLOSED);
    await waitForSocketState(client3, client3.CLOSED);

    const [group1, message1] = messages1;
    const [group2, message2] = messages2;

    // Both client1 and client2 should have joined the same group.
    expect(group1).toBe(creationMessage.value);
    expect(group2).toBe(creationMessage.value);

    // Both client1 and client2 should have received the group message.
    expect(message1).toBe(testMessage);
    expect(message2).toBe(testMessage);

    // client3 should have received no messages
    expect(messages3.length).toBe(0);
  });
});
