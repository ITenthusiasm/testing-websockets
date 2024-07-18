# Testing WebSockets

A repository exemplifying how to write integration tests for WebSocket servers using Vitest (a testing framework compatible with Jest).

You likely came here from my [Medium article](https://thomason-isaiah.medium.com/writing-integration-tests-for-websocket-servers-using-jest-and-ws-8e5c61726b2a). If you've decided to read the article here or mess around with the code, I want to give some quick information about the structure of this project's code.

## The Codebase

In this repository, you'll find a JavaScript version of my article's code examples and a TypeScript version. Both versions have types and JSDocs that will help you understand the code better.

There are some places in the article where old code is refactored. Whenever this happens, I create a new version of the file. For instance, the `createWebSocketServer.test.js` file has 3 versions: a `v1`, a `v2`, and a final version which has no "version indicator". The only difference between the 2 versions of `webSocketTestUtils.js` is the version of `createWebSocketServer.js` that they import.

Lastly, you'll notice that the `port` at the top of each test is a calculated value instead of a constant. This is because there are different files for the different versions of the WebSocket tests, and you might want to run all of these tests simultaneously. If you decide to run all versions of the tests simultaneously, the dynamically-calculated ports will keep your test servers from accidentally trying to connect to the same port.

## Packages

In the article, we only install `ws` (prod dependency) and `vitest` (dev dependency compatible with `jest`). Here, you'll see additional `@types/*` and `typescript` dependencies. These are used to support the TypeScript version of this codebase. You don't need to worry about them unless you're interested in those things.

Those should be the only major differences. You needn't be worried about any of them. Please keep all feedback on the [Medium article](https://thomason-isaiah.medium.com/writing-integration-tests-for-websocket-servers-using-jest-and-ws-8e5c61726b2a) unless you're seeking to make a contribution.

# Writing Integration Tests for WebSocket Servers Using Jest/Vitest and WS

WebSockets are very useful for ongoing communication between a client and a server. They're simple to use in nature, but they're not so simple when it comes to writing tests. This is because WebSockets are event-driven and have no promise-based API. For instance, maybe you want to test that your WebSocket server returns the correct message to a client with Jest/Vitest. How will you wait for a connection before having your client send a message? How will you get a hold of the response message that your client receives and perform your assertions? How will Jest/Vitest know when a given test is finished? These are the kinds of questions I hope to address in this post on writing integration tests for WebSocket servers.

Here's our outline:

- [Installation](#installation)
- [Project Setup](#project-setup)
- [Creating Utility Functions](#creating-utility-functions)
  1. [Start Server Function](#first-utility-start-server-function)
  2. [Function to Wait for Socket State](#second-utility-function-to-wait-for-socket-state)
- [Writing the Integration Test](#writing-the-integration-test)
- [Adding More Utilities to the `TestWebSocket` Class](#adding-more-utilities-to-the-testwebsocket-class)
  1. [Managing the Messages That a Client Receives](#1-managing-the-messages-that-a-client-receives)
  2. [Waiting for Specific Client Messages](#2-waiting-for-specific-client-messages)
- [Covering More Test Cases (Optional)](#covering-more-test-cases-optional)
- [Wrap-up](#wrap-up)

Note that _Covering More Test Cases_ is completely optional. It's only necessary if you want more complex examples.

Everything here can also be found on [GitHub](https://github.com/ITenthusiasm/testing-websockets).

## Installation

Before we get started, we'll need to install the necessary packages. We'll be using [`vitest`](https://vitest.dev/) (a test framework compatible with [`jest`](https://jestjs.io)) for our tests and [`ws`](https://github.com/websockets/ws) for our web socket server. You're free to use different tools, but you'll have to adjust your syntax accordingly as you go through the examples.

One more thing: When this article was written, the latest major version of `vitest` was `v2`, and the latest major version of `ws` was `v8`. If newer major versions are available at the time that you read this article, then you're welcome to use those instead. However, you might have to tweak the code in this article if you do so. (Very likely, you'll have very little tweaking to do -- if any.)

```
npm install ws
npm install -D vitest
```

## Project Setup

Before we can do anything, we need an actual WebSocket server to test. Let's create a function that makes one.

```js
// createWebSocketServer.js
import { WebSocketServer } from "ws";

function createWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (webSocket) => {
    webSocket.on("message", (message) => {
      webSocket.send(message);
    });
  });
}

export default createWebSocketServer;
```

This function creates a WebSocket server from the server you pass to it. This is particularly helpful because it enables you to use your real server when you run your application and a test server when you run your tests. To keep things simple, we're only echoing back whatever the client sends. We'll update this later!

Next, let's set up our test file. We'll just start with a basic skeleton. We know we'll need to start the server before all our tests, we know we'll need to close the server after all our tests, and we know we'll need a physical test for our WebSocket server. Let's start with that.

```js
// createWebSocketServer.test.js
import { beforeAll, afterAll, describe, it } from "vitest";

describe("WebSocket Server", () => {
  beforeAll(() => {
    // Start server
  });

  afterAll(() => {
    // Close server
  });

  it("Echoes the message it receives from the client", () => {
    // 1. Create the test client
    // 2. Send a client message to the server
    // 3. Perform assertions on the response message that the client receives
    // 4. Close the client when everything is done
  });
});
```

Now that we have a roadmap of what we need, let's start filling in the blanks!

## Creating Utility Functions

It might seem weird to have this as its own section; but honestly, this is the hardest part of writing integration tests for WebSocket servers. As I mentioned, we don't have any out-of-the-box, promise-based APIs for WebSockets. This means it's critical to set up good utility functions to ensure that everything _clearly_ happens in the right order. Otherwise, we'll be tortured by tons of callbacks.

Here's what we need:

1. An `await`able function that starts the server and returns it.
   - This is necessary for the `beforeAll` and `afterAll` portions of our test file.
2. A function that can wait for a client to open or close a connection.
   - Reliably sending client messages, performing assertions on the response messages, and telling Vitest/Jest when a test is done requires us to have this control.

There are more utilities that we'll create later. But for now, let's focus on creating these 2 helpers so that we can start writing our first test. We'll put these utility functions in a separate file called `webSocketTestUtils.js`.

### First Utility: A Start Server Function

This one should be pretty straightforward. Here's the code that we'll use:

```js
// webSocketTestUtils.js
import http from "node:http";
import createWebSocketServer from "./createWebSocketServer.js";

/**
 * @param {number} port
 * @returns {Promise<http.Server>}
 */
export function startServer(port) {
  const server = http.createServer();
  createWebSocketServer(server);

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}
```

Here, we're merely creating (and starting) a basic server that we can use to test all of our WebSocket functionality. For modularity, the port number to listen on is passed in. This function will be easy to use in our test file:

```js
// createWebSocketServer.test.js
import { beforeAll, afterAll, describe, it } from "vitest";
import { startServer } from "./webSocketTestUtils";

const port = 3000;

describe("WebSocket Server", () => {
  let server;

  beforeAll(async () => {
    server = await startServer(port);
  });

  afterAll(() => {
    server.close();
  });

  it("Echoes the message it receives a client", () => {
    // 1. Create the test client
    // 2. Send a client message to the server
    // 3. Perform assertions on the response message that the client receives
    // 4. Close the client when everything is done
  });
});
```

### Second Utility: A Function to Wait for Socket State

This utility function (which we will call `waitUntil`) will be a little more involved, and it will require a good grasp on how [`Promise`s](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) and [event listeners](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events) work. You don't have to understand these concepts to be able to _use_ this utility function. However, if you ever want to modify or extend what I show you, then a sufficient grasp of these concepts will be necessary.

I'll comment out some of the code that we're not focused on for brevity.

```js
// webSocketTestUtils.js
import { WebSocket } from "ws";
import createWebSocketServer from "./createWebSocketServer.js";

// ...

export class TestWebSocket extends WebSocket {
  /**
   * @param {"open" | "close"} state
   * @param {number} [timeout]
   * @returns {void | Promise<void>}
   */
  waitUntil(state, timeout = 1000) {
    if (this.readyState === this.OPEN && state === "open") return;
    if (this.readyState === this.CLOSED && state === "close") return;

    return new Promise((resolve, reject) => {
      /** @type {NodeJS.Timeout | undefined} */
      let timerId;
      const handleStateEvent = () => {
        resolve();
        clearTimeout(timerId);
      };

      this.addEventListener(state, handleStateEvent, { once: true });

      timerId = setTimeout(() => {
        this.removeEventListener(state, handleStateEvent);
        if (this.readyState === this.OPEN && state === "open") return resolve();
        if (this.readyState === this.CLOSED && state === "close") return resolve();

        reject(new Error(`WebSocket did not ${state} in time.`));
      }, timeout);
    });
  }
}
```

There's _a lot_ going on here, so let me break everything down. First of all, notice that we're extending `ws`'s `WebSocket` class with our own helper class. This allows us to add test-related capabilities to a standardized WebSocket client, making our tests easier to write. Here, we're attaching our `waitUntil` utility to this helper class as a method.

What exactly is our `waitUntil` method doing? Well, it's doing a few things...

**First**: If the client is already [`OPEN`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState) (or `CLOSED`), then we don't create a `Promise`. Instead, the method simply returns synchronously. This approach prevents us from generating unnecessary `Promise`s. As a result, it adds some protection against race conditions. (For the clever among you: No, the `setTimeout` call is not enough protection against race conditions.)

**Second**: If the client _was not_ already `OPEN` (or `CLOSED`) when `waitUntil` was called, then we return a `Promise`. Inside this `Promise` we create a one-time [`open`](https://github.com/websockets/ws/blob/master/doc/ws.md#event-open) (or [`close`](https://github.com/websockets/ws/blob/master/doc/ws.md#event-close-1)) event handler that will immediately resolve the `Promise` when triggered. Also notice that our event handler will automatically unregister itself when it is triggered thanks to the [`once`](https://github.com/websockets/ws/blob/master/doc/ws.md#websocketaddeventlistenertype-listener-options) option.

(Note: `ws`'s `WebSocket` class [extends the native `EventEmitter` class in Node](https://github.com/websockets/ws/blob/master/doc/ws.md#class-websocket). So if you prefer to use the `EventEmitter` API for registering and unregistering event handlers, you are free to do that instead.)

**Third**: We provide the ability for `waitUntil` to timeout. If the client takes too long to `open` (or `close`), then the `Promise` that we return will `reject` with a Timeout Error. This provides a much better DX for test writers. Callers of `waitUntil` also have the ability to control how long the process should wait before timing out.

Note that it is _theoretically_ possible for a WebSocket client to `open` (or `close`) _after_ the returned `Promise` is created but _before_ the corresponding event handler is registered. In that (rare) scenario, we "recover" from the race condition by `resolv`ing the `Promise` if the client is in the proper `readyState` when the timeout function is executed.

**Fourth**: We do any necessary cleanup. If our returned `Promise` resolves, then we clear the timeout function because it is no longer needed. If the timeout function is executed, then we unregister our event handler because it was not used and is no longer relevant. By performing the appropriate cleanup, we protect ourselves from accidentally wasting resources in our tests.

**Sidenote**: Some of you may have realized that the synchronous check at the beginning of `waitUntil` is _technically_ "unnecessary". This is because our timeout function can handle scenarios where the client is `OPEN` (or `CLOSED`) before the `handleStateEvent` function is registered as an event handler. However, there are two problems with relying on that assumption:

1. A test should not force a process to wait for 1000+ milliseconds unnecessarily.
2. For developers who are doing _very_ clever things with `Promise`s, _other_ unexpected race conditions could arise from not handling this scenario synchronously. When testing WebSockets, it is simply best to avoid adding something to the [Event Loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop) whenever possible.

## Writing the Integration Test

With the basic utility functions done, we can finally start writing our first integration test! We'll follow the process that we put in the comments earlier: 1&rpar; Create the test client, 2&rpar; Send a client message to the server, 3&rpar; Perform assertions on the response message that the client receives, and 4&rpar; Close the client when everything is done.

```js
// createWebSocketServer.test.js
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { startServer, TestWebSocket } from "./webSocketTestUtils";

const port = 3000;
const url = `ws://localhost:${port}`;

describe("WebSocket Server", () => {
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
      client.addEventListener("message", (data) => resolve(data.toString("utf8")), { once: true });

      // 2) Send a client message to the server
      client.send(testMessage);
    });

    // 3) Perform assertions on the response message that the client receives
    expect(responseMessage).toBe(testMessage);

    // 4) Close the client when everything is done
    client.close();
  });
});
```

Let's walk through this. We start off by creating a test client and waiting for its connection to open. We then prepare a test message to send to the server.

Next, we create a `Promise` that registers a one-time `message` event handler before sending our message to the server. This `Promise` will only resolve after a response message has been received, and it will resolve with the received message. Once we get the response message back from the WebSocket server, we verify that it's the same message that our client originally sent.

Finally, we close our WebSocket client. (This is necessary to prevent our tests from hanging.)

And that's it! You can verify that the test succeeds by running `npx vitest`. Alternatively, you can make an npm script that runs `vitest` for you.

## Adding More Utilities to the `TestWebSocket` Class

Although the test that we just wrote might look simple, your WebSocket server tests can get significantly harder to write and maintain once you start introducing complex use cases. For example, if you have more clients and/or you're sending more messages to the server, then you'll have to create more `Promise`s that wrap `message` event handlers. This gets verbose and redundant very quickly, and you can easily run into this problem if you're testing something as simple as a Group Chat Room.

To circumvent this problem, we can create additional helper methods that enable us to manage WebSocket client messages in a clear, _sequential_, _predictable_ order. Once we have those, the likelihood that we'll run into a test that's hard to write or understand drops dramatically. So let's create some of these helpers.

### 1&rpar; Managing the Messages That a Client Receives

First, let's create a way for our `TestWebSocket` to keep track of all of the messages that it has received.

```js
export class TestWebSocket extends WebSocket {
  /** @type {string[]} */
  #messages = [];

  /** @param {ConstructorParameters<typeof WebSocket>} args */
  constructor(...args) {
    super(...args);

    /** @param {import("ws").MessageEvent} event */
    const addNewMessage = (event) => this.#messages.push(event.data.toString("utf8"));

    this.addEventListener("message", addNewMessage);
    this.addEventListener("close", () => this.removeEventListener("message", addNewMessage), { once: true });
  }

  // waitUntil() { ... }
}
```

Here, we register a `message` event handler with our WebSocket client _immediately_ after it's created. Whenever the client receives a message, that message gets stored in a [privately held](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_properties) array for later use. With this setup, we'll never lose track of any messages that the client receives.

Notice the one-time `close` event handler as well. It's configured to automatically remove the `message` event handler whenever the client closes. This prevents us from accidentally wasting resources.

(Tip: If for any reason you'll need to close a client's connection and then re-open it, you can abstract the logic in the constructor into a `listenForMessages()` method. This will require the client to keep track of a private, boolean `#listening` field so that it won't accidentally register duplicate event handlers if the method is called multiple times.)

Let's expose the messages that the `TestWebSocket` receives with a [`getter`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get) so that our tests can inspect them:

```js
export class TestWebSocket extends WebSocket {
  /** @type {string[]} */
  #messages = [];
  // constructor() { ... }

  get messages() {
    return this.#messages.slice();
  }

  // waitUntil() { ... }
}
```

**_We're intentionally excluding a [`setter`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/set) here_** to prevent the outside world from corrupting the client's internal message data. **_We're also using [`Array.slice`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice)_** to prevent the outside world from mutating the _original_ array of messages.

If any tests need to alter a client's message data for any reason, we can expose methods that allow these operations to be done safely and predictably. For example, if a test wants to "forget" the messages that a WebSocket client received, we can provide a safe `clearMessages` method:

```js
export class TestWebSocket extends WebSocket {
  /** @type {string} */
  #messages = [];
  // constructor() { ... }

  /** @returns {string[]} The stored messages that the `WebSocket` has received (and not yet {@link clearMessages cleared}). */
  get messages() {
    return this.#messages.slice();
  }

  /** Clears all of the stored {@link messages} that were previously received by the `WebSocket`. @returns {void} */
  clearMessages() {
    this.#messages.splice(0, this.#messages.length);
  }

  // waitUntil() { ... }
}
```

These utilities (the constructor, the `messages` getter, and the `clearMessages` method) provide all that we need to manage the messages that a WebSocket client receives.

### 2&rpar; Waiting for Specific Client Messages

Now that we have a way to manage the messages that a WebSocket client receives, we can create a helper method which will enable a test to wait until a client receives the expected message. We'll call this method, `waitForMessage`. Its structure will be very similar to the `waitUntil` method.

```js
export class TestWebSocket extends WebSocket {
  /** @type {string[]} */
  #messages = [];
  // constructor() { ... }
  // get messages() { ... }
  // clearMessages() { ... }
  // waitUntil() { ... }

  /**
   * @param {string} message
   * @param {boolean} [includeExistingMessages]
   * @param {number} [timeout]
   * @returns {void | Promise<void>}
   */
  waitForMessage(message, includeExistingMessages = true, timeout = 1000) {
    if (includeExistingMessages && this.#messages.includes(message)) return;
    const originalMessageIndex = this.#messages.lastIndexOf(message);

    return new Promise((resolve, reject) => {
      /** @type {NodeJS.Timeout | undefined} */
      let timerId;

      /** @param {import("ws").MessageEvent} event */
      const checkForMessage = (event) => {
        if (event.data.toString("utf8") !== message) return;

        resolve();
        clearTimeout(timerId);
        this.removeEventListener("message", checkForMessage);
      };

      this.addEventListener("message", checkForMessage);

      timerId = setTimeout(() => {
        this.removeEventListener("message", checkForMessage);

        const success = includeExistingMessages
          ? this.#messages.includes(message)
          : this.#messages.lastIndexOf(message) > originalMessageIndex;

        if (success) return resolve();
        reject(new Error(`WebSocket did not receive the message "${message}" in time.`));
      }, timeout);
    });
  }
}
```

I'll describe everything that we're doing here. Everything that I say should sound _very_ similar to what was said for the `waitUntil` method that we created earlier.

**First**: If the client has already received the desired message when `waitForMessage` is called, then we return synchronously _as long as the `includeExistingMessages` option is `true`_. It's theoretically possible that a client could receive the same message multiple times. If the stored messages have not been cleared and the developer is anticipating a _new_ message that matches the provided string, then they can set `includeExistingMessages` to `false` to handle that use case.

As with `waitUntil`, our approach here prevents us from generating unnecessary `Promise`s.

**Second**: If the client has _not_ already received the desired message (or if the developer wants to wait for a _new_ message), then we return a `Promise`. Inside this `Promise` we create a `message` event handler called `checkForMessage`. When this event handler receives a message matching the desired value, it will `resolve` the `Promise` and unregister itself. (Unregistering the event handler allows us to avoid causing memory leaks.)

**Third**: We provide the ability for `waitForMessage` to timeout. If the client takes too long to receive the desired message, then the `Promise` that we return will `reject` with a Timeout Error. This provides a much better DX for test writers. Callers of `waitForMessage` also have the ability to control how long the process should wait before timing out.

In the _unlikely_ scenario where a WebSocket client receives the desired message _after_ the returned `Promise` is created but _before_ the corresponding event handler is registered, we "recover" the race condition by `resolv`ing the `Promise`.

**Fourth**: We do any necessary cleanup. If our returned `Promise` resolves, then we clear the timeout function because it is no longer needed. If the timeout function is executed, then we unregister our event handler because it was not used and is no longer relevant. By performing the appropriate cleanup, we protect ourselves from accidentally wasting resources in our tests.

Are you seeing a pattern emerge between `waitUntil` and `waitForMessage`? The pattern basically looks something like this:

1. Return synchronously whenever possible.
2. Create a `Promise` that will `resolve` when the desired event is triggered _and_ the desired conditions are met.
3. Prepare a `setTimeout` function that will `reject` the `Promise` if the method times out (or `resolve` the `Promise` if there was a race condition that can be "recovered").
4. Cleanup all event handlers and/or timeout functions as needed.

If you follow that outline, you'll be able to create your own robust, race-condition-resilient helpers for your WebSocket clients with ease. We could create more helper methods, but this will suffice for now. Let's try implementing what we have in our original test:

```js
// createWebSocketServer.test.js
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { startServer, TestWebSocket } from "./webSocketTestUtils";

const port = 3000;
const url = `ws://localhost:${port}`;

describe("WebSocket Server", () => {
  let server;

  beforeAll(async () => {
    server = await startServer(port);
  });

  afterAll(() => {
    server.close();
  });

  it("Echoes the message it receives from client", async () => {
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
```

Not only is this new version of our test more succinct, but it's significantly more readable as well! From a readability perspective, it's nice that we get to send the message first, _then_ wait for the response. Previously, to avoid unforeseen race conditions, we had to register a `message` event handler first, then send the message to the client. However, our `TestWebSocket` class always keeps track of the messages that it receives internally, so it will always be safe to send a client message before waiting for the response.

If you add a new developer to your team and they see this code for the first time, it will read much more like plain English since the complications of callbacks and event handlers have been abstracted away. Adding documentation to the testing utilities will further improve the developer experience.

Now about those additional test cases I mentioned...

## Covering More Test Cases (Optional)

We know how to write tests which verify that our WebSocket server correctly echoes messages back to clients. That knowledge is great, but it doesn't give us very much to work with. What if the server is supposed to send a message to multiple clients? What if it needs to respond to 1 client with multiple messages? We need to know how to test these more advanced use cases, and that's what we'll look at next.

Note: **[If you feel like you've learned all you need to get started, you can skip this entire section!](#wrap-up)** Otherwise, we'll consider 2 more test cases before wrapping up:

1. The server sending a message to multiple _specific_ clients.
2. The server sending multiple messages back to a single client.

### 1&rpar; Having the Server Send a Message to Multiple _Specific_ Clients

I want to refactor our `createWebSocketServer` function a little bit. Since we'll be handling new use cases, we need the WebSocket server to know how to handle different kinds of messages. There are multiple ways to approach this problem. One way is to tell the server to expect an object with a `type` property and a `value` property. The `type` property will drive the behavior of the WebSocket server, and the `value` property will specify the true content of the message. For our small example, this approach is fine. Let's start by updating our original code.

```js
// createWebSocketServer.js
import { WebSocketServer } from "ws";

function createWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (webSocket) => {
    webSocket.on("message", (message) => {
      const data = JSON.parse(message);

      switch (data.type) {
        case "ECHO": {
          webSocket.send(data.value);
          break;
        }
      }
    });
  });
}

export default createWebSocketServer;
```

Notice that we're expecting the object to come in as a JSON string that we can parse. Again, this is just one of many approaches. With this refactor out of the way, we can start supporting new use cases.

To address the scenario where a server needs to send a message to multiple _specific_ clients, we'll create a fake group chat. Clients who connect to the WebSocket server will be able to create a group, join a group, and send a message to their group. When a message is sent to a group, only the clients in that group will receive the message. (The sender will also receive the message for confirmation of success.) This will require adding 3 additional cases to the `switch/case` statement that we added.

```js
// createWebSocketServer.js
import { WebSocketServer } from "ws";

/** @type {Set<string>} */
const groupNames = new Set();

function createWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (webSocket) => {
    webSocket.on("message", (message) => {
      const data = JSON.parse(message);

      switch (data.type) {
        case "ECHO": {
          webSocket.send(data.value);
          break;
        }
        case "CREATE_GROUP": {
          const groupName = data.value;
          if (groupNames.has(groupName)) return webSocket.send(`GROUP_UNAVAILABLE: ${groupName}`);

          groupNames.add(groupName);
          webSocket.groupName = groupName;
          webSocket.send(`GROUP_CREATED: ${groupName}`);
          break;
        }
        case "JOIN_GROUP": {
          const groupName = data.value;
          if (!groupNames.has(groupName)) return webSocket.send(`GROUP_UNAVAILABLE: ${groupName}`);

          webSocket.groupName = groupName;
          webSocket.send(`GROUP_JOINED: ${groupName}`);
          break;
        }
        case "MESSAGE_GROUP": {
          const { groupName, groupMessage } = data.value;
          if (webSocket.groupName !== groupName) return;

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
```

Here, we've created a `groupNames` [Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set) to keep track of all the groups that currently exist. When a person creates a new group, it's added to `groupNames`. If the group's name is taken, the client gets an error message. Any clients seeking to join a group must use a name that is already in `groupNames`. Invalid names will result in an error message from the server. Clients who successfully join/create a group will receive a confirmation message.

Finally, whenever a client sends a group message, the message is delivered to all clients associated with that group. The message will only go through if it was sent by a client who was already in the group.

Remember that this is a simple example for the sake of demonstrating how to write tests. A more realistic WebSocket server would be more complex. For instance, it would provide a way to leave a group, and it would delete a group when no more clients are associated with it.

We have enough to get us going, so we can finally write our next test. The trick here is keeping track of the order of events: A client can't join a group that doesn't exist, so we need to make sure that anyone trying to join a group does so _after_ it has been created.

(Note: In addition to adding a new test for our group chat, we'll also be making a slight update to the first test that we wrote. We need to do this because our server logic for echoing messages back to clients was changed.)

```js
// createWebSocketServer.test.js
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { startServer, TestWebSocket } from "./webSocketTestUtils";

const port = 3000;
const url = `ws://localhost:${port}`;

describe("WebSocket Server", () => {
  let server;

  beforeAll(async () => {
    server = await startServer(port);
  });

  afterAll(() => {
    server.close();
  });

  it("Echoes the message it receives from a client when the message is of type `ECHO`", async () => {
    // Create the test client
    const client = new TestWebSocket(url);
    await client.waitUntil("open");
    const testMessage = { type: "ECHO", value: "This is a test message" };

    // Send client message and check the response
    client.send(JSON.stringify(testMessage));
    await client.waitForMessage(testMessage.value);

    // Cleanup
    client.close();
  });

  it("Delivers group messages only to the clients who belong to the specified group", async () => {
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
    await client1.waitForMessage(testMessage);
    await client2.waitForMessage(testMessage);

    // Client 3 should have received no messages
    expect(client3.messages.length).toBe(0);
    [client1, client2, client3].forEach((c) => c.close());
  });
});
```

Can you believe how easy that test was to write?!? Imagine how complex/verbose the test would be if we had to use callbacks _and_ set them up in the proper order! A complex test was made _extremely_ easy to write thanks to our `TestWebSocket`'s helper methods! This is where a solid knowledge of `Promise`s and event handling really pays off!

(For those of you who aren't as excited as I am, please understand: This is my second iteration of this article. In my [first iteration](https://github.com/ITenthusiasm/testing-websockets/tree/main/previous-iterations/v1), the [utilities](https://github.com/ITenthusiasm/testing-websockets/tree/main/previous-iterations/v1/javascript/webSocketTestUtils.js) that I provided weren't as good. As a result, [testing this use case](https://github.com/ITenthusiasm/testing-websockets/tree/main/previous-iterations/v1/javascript/createWebSocketServer.test.js#L69) required almost 2x the lines code, and the test was far less readable. The code that you see above is incredible compared to that!)

You'll notice that although we added multiple new features to our WebSocket server, we've only created a test for one scenario. I'll leave testing the other scenarios as an exercise for you if you're up for it. Most of the other ones are of similar (or easier) difficulty.

### 2&rpar; Having the Server Send Multiple Messages to a Single Client

For this section, we'll have the server echo the client's message back multiple times. This code change is straightforward. I'll focus only on the `switch/case` statement here for brevity.

```js
// createWebSocketServer.js

// ...

switch (data.type) {
  case "ECHO": {
    webSocket.send(data.value);
    break;
  }
  case "ECHO_TIMES_3": {
    for (let i = 1; i <= 3; i++) webSocket.send(data.value);
    break;
  }
  // Group Chat Switch Cases ...
}

export default createWebSocketServer;
```

In the real world, you'd probably be sending different kinds of messages to the client instead of repeating the same one. But for the sake of our example, this will suffice.

Before we update our test file, let's create a new utility method to help us with this use case. We'll call it, `waitForMessageCount`. This method will allow a test to wait until a WebSocket client has received a certain _number_ of messages.

```js
export class TestWebSocket extends WebSocket {
  /** @type {string[]} */
  #messages = [];
  // constructor() { ... }
  // get messages() { ... }
  // clearMessages() { ... }
  // waitUntil() { ... }
  // waitForMessage() { ... }

  /**
   * @param {number} count
   * @param {number} [timeout]
   * @returns {this["messages"] | Promise<this["messages"]>}
   */
  waitForMessageCount(count, timeout = 1000) {
    if (this.#messages.length >= count) return this.messages;

    return new Promise((resolve, reject) => {
      /** @type {NodeJS.Timeout | undefined} */
      let timerId;
      const watchMessageCount = () => {
        if (this.#messages.length < count) return;

        resolve(this.messages);
        clearTimeout(timerId);
        this.removeEventListener("message", watchMessageCount);
      };

      this.addEventListener("message", watchMessageCount);

      timerId = setTimeout(() => {
        this.removeEventListener("message", watchMessageCount);

        if (this.#messages.length >= count) return resolve(this.messages);
        reject(new Error(`WebSocket did not receive ${count} messages in time.`));
      }, timeout);
    });
  }
}
```

At this point, I'm assuming that you're familiar with the pattern of creating these WebSocket helper methods, so I won't walk step-by-step through what the method above is doing. The only thing worth noting here is that this time we're returning the WebSocket client's messages when `waitForMessageCount` finishes. **_And since we don't want callers to be able to mutate the client's state, we only `return` or `resolve` with `this.messages` instead of `this.#messages`._** (Remember that the getter, `this.messages`, returns a _copy_ of the messages array so that the original data can't be mutated.)

This helper is flexible because it works even if we don't know how many messages the client has before the method is called.

```js
// If we _know_ that the client has received 0 messages:
await client.waitForMessageCount(3);

// If we _don't know_ how many messages the client has already received:
await client.waitForMessageCount(client.messages.length + 3);
```

With that out of the way, let's update our test file. Again, I'll solely focus on the new code for brevity.

```js
// createWebSocketServer.test.js

// ...

it("Echoes the message it receives from a client 3 times when the message is of type `ECHO_TIMES_3`", async () => {
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
```

Yet again, our test is quite simple -- just like our previous ones.

## Wrap-up

And now we're finally done! In this article, we learned how to write integration tests for WebSocket servers, and we created a few utilities to greatly simplify this process. Let me know what you thought! I want to make sure this is a sufficient example on writing integration tests for WebSocket servers, so all questions and critiques (and appreciations 😅) are welcome!

As I said at the beginning, this article (including the code for its examples) can be found on [GitHub](https://github.com/ITenthusiasm/testing-websockets). There, I have a JavaScript version and a TypeScript version of the codebase. Both use JSDocs to make life a little easier if you decide to play around.

### Special Thanks

I want to give a special thanks to stackoverflow users [user3215378 and Dmitry Taipov](https://stackoverflow.com/a/21394730), and users [FleMo and Timo Tijhof](https://stackoverflow.com/a/55963641). They were a great source of inspiriation for my first iteration of this article. If I hadn't written that article and tried to learn from my previous mistakes, I would not have been able to discover the new techniques that you saw here.

I also want to thank Kent C. Dodds for his insights into writing integration tests. If you're interested, you can find his courses on testing JavaScript [here](https://testingjavascript.com/). He didn't touch on testing WebSocket servers, but he did provide the inspiration for me to try tackling this after several headaches.

Next, I want to thank all of you! The readers! Yes, I know it's a cheesy thing that content creators often say. But genuinely, I would not have been motivated to improve this article and give you all a better test-writing experience if I didn't have your feedback. **You** have legitimately made this article better.

Finally, above all, I want to thank the Lord Jesus Christ. I believe in giving credit where credit is due, so I can't leave God out of the equation (even if acknowledging Him makes me unpopular). He gave me life, as well as a brain that was able to conceive of this new technique. Without Him, neither this article nor its first iteration would have been written.
