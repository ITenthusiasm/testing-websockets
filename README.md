# testing-websockets

Repository exemplifying how to write integration tests for WebSocket servers using Jest.

You likely came here from my [Medium article](). If you've decided to read the article here or mess around with the code, I want to give some quick information about the structure of this project's code.

## The Codebase

I've created a JavaScript version of the examples (which the original article uses) and a TypeScript version for anyone who's interested. Unlike in the article, I've also added some JSDocs to help anyone who decides to play around with the utility functions. Because of this, you may see additional imports that are used solely for getting type definitions.

There are some places in the article where old code is refactored. Whenever this happens, I create a new version of the file. For instance, the `createWebSocketServer.test.js` file has 3 versions: a `v1`, a `v2`, and a final version which has no "version indicator". The only difference between the 2 versions of `webSocketTestUtils.js` is the version of `createWebSocketServer.js` that they import.

Due to the fact that the tests have different versions (and are in JS/TS), you'll notice that the `port` at the top of each test is a calculated value instead of a constant. If you decide to run all versions of the test simultaneously, this will keep you from trying to connect to ports that are already in use.

## Packages

In the article, we only install `ws` (prod dependency) and `jest` (dev dependency). Here, you'll see additional `@types` and `@babel` dependencies. These are used to support the TypeScript version of this codebase, and to enable certain ES features. You don't need to worry about them unless you're interested in those things.

Those should be the only major differences. You needn't be worried about any of them. Please keep all feedback on the [Medium article]() unless you're seeking to make a contribution.

# Writing Integration Tests for WebSocket Servers Using Jest and WS

WebSockets are very useful for ongoing communication between a client and a server. They're simple to use in nature, but they're not so simple when it comes to writing tests. This is because WebSockets are event-driven and have no promise-based API. For instance, maybe you want to test that your WebSocket server returns the correct message to a client with Jest. How will you wait for a connection before having your test client send a message? How will you get a hold of the message your client received and perform assertions? How will Jest know when a given test is finished? These are the kinds of questions I hope to address in this post on writing integration tests for WebSocket servers.

Here's our outline:

- [Installation](#installation)
- [Project Setup](#project-setup)
- [Creating Utility Functions](#creating-utility-functions)
  1. [Start Server Function](#first-utility-start-server-function)
  2. [Function to Wait for Socket State](#second-utility-function-to-wait-for-socket-state)
- [Writing the Integration Test](#writing-the-integration-test)
- [Adding One More Utility for the Client](#adding-one-more-utility-for-the-client)
- [Covering More Test Cases (Optional)](#covering-more-test-cases-optional)
- [Brief Comments](#brief-comments)
- [Summary](#summary)

Note that _Covering More Test Cases_ is by far the longest section here and is completely optional. It's only necessary if you want more complex examples.

Everything here can also be found on [github]().

## Installation

Before we get started, we'll need to install the necessary packages. We'll be using [jest](https://jestjs.io) for our tests and [ws](https://github.com/websockets/ws) for our web socket server. You're free to use different tools, but you'll have to adjust your syntax accordingly as you go through the examples.

```
npm install ws
npm install -D jest
```

## Project Setup

Before we can do anything, we need an actual WebSocket server to test. Let's create a function that makes one.

```javascript
// createWebSocketServer.js

import WebSocket from "ws";

function createWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", function (webSocket) {
    webSocket.on("message", function (message) {
      webSocket.send(message);
    });
  });
}

export default createWebSocketServer;
```

This function creates a WebSocket server from the server you pass to it. It's particularly useful because it allows you to use your real server when running your application and a simple one when running tests. To keep things simple, we're only echoing back whatever the client sends. We'll update this later!

Next, let's set up our test file. We'll just start with a skeleton. We know we'll need to start the server before all our tests, we know we'll need to close the server after all our tests, and we know we'll need a physical test for our WebSocket server. Let's start with that.

```javascript
// createWebSocketServer.test.js

describe("WebSocket Server", () => {
  beforeAll(() => {
    // Start server
  });

  afterAll(() => {
    // Close server
  });

  test("Server echoes the message it receives from client", () => {
    // 1. Create test client
    // 2. Send client message
    // 3. Close the client after it receives the response
    // 4. Perform assertions on the response
  });
});
```

Now that we have a roadmap of what we need, let's start filling in the blanks!

## Creating Utility Functions

It might seem weird to have this as its own section, but honestly, this is arguably the hardest part of writing integration tests for WebSocket servers. As I mentioned, we don't have any out-of-the-box promise-based APIs for WebSockets. This means it's critical to setup good utility functions to ensure that everything _clearly_ happens in the right order. Otherwise, we'll be tortured by tons of callbacks.

Here's what we need:

1. An `await`able function that starts the server and returns it
   - This is necessary for the `beforeAll` and `afterAll` portions of our test file.
2. A function that can wait for a client to open or close a connection.
   - Reliably sending test messages, performing assertions on the responses, and telling Jest when the test is done requires us to have this control.

We'll walk through each one of these functions and apply them to our test. Let's put these utility functions in a separate file called `webSocketTestUtils.js`.

### First Utility: Start Server Function

This one should be pretty straightforward. Here's the code that we'll use:

```javascript
// webSocketTestUtils.js

import http from "http";
import createWebSocketServer from "./createWebSocketServer";

function startServer(port) {
  const server = http.createServer();
  createWebSocketServer(server);

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

export { startServer };
```

Here, we're merely creating (and starting) a basic server that we can use to test all of our WebSocket functionality. For modularity, the port number to listen on is passed in. This function will be easy to use in our test file.

```javascript
// createWebSocketServer.test.js

import { startServer } from "./webSocketTestUtils";

const port = 3000;

describe("WebSocket Server", () => {
  let server;

  beforeAll(async () => {
    server = await startServer(port);
  });

  afterAll(() => server.close());

  test("Server echoes the message it receives from client", () => {
    // 1. Create test client
    // 2. Send client message
    // 3. Close the client after it receives the response
    // 4. Perform assertions on the response
  });
});
```

### Second Utility: Function to Wait for Socket State

This function is another easy one, but it requires a good grasp on how promises work. I'll "comment out" some of the code we're not focused on for brevity.

```javascript
// webSocketTestUtils.js

// ...

function waitForSocketState(socket, state) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      if (socket.readyState === state) {
        resolve();
      } else {
        waitForSocketState(socket, state).then(resolve);
      }
    }, 5);
  });
}

export { startServer, waitForSocketState };
```

In short, this function takes a client WebSocket and forces the process to wait until the client socket's state becomes the desired value. It does this by recursively calling itself until the client socket's state is correct.

The `setTimeout` function acts as a light buffer to avoid performing too many function calls. You can make the delay whatever you want, but I recommend using a small number to verify that the function behaves properly. (If the function behaves _incorrectly_ and the delay is small, Jest will log warnings/errors due to async-related problems.)

## Writing the Integration Test

With the basic utility functions done, we can finally start writing our first integration test! We'll follow the process that we put in the comments earlier: 1) Create the test client, 2) Send the client message, 3) Close the client after it receives the response, and 4) Perform assertions on the response.

```javascript
// createWebSocketServer.test.js

import WebSocket from "ws";
import { startServer, waitForSocketState } from "./webSocketTestUtils";

const port = 3000;

describe("WebSocket Server", () => {
  let server;

  beforeAll(async () => {
    server = await startServer(port);
  });

  afterAll(() => server.close());

  test("Server echoes the message it receives from client", async () => {
    // Create test client
    const client = new WebSocket(`ws://localhost:${port}`);
    await waitForSocketState(client, client.OPEN);

    const testMessage = "This is a test message";
    let responseMessage;

    client.on("message", (data) => {
      responseMessage = data;

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
```

Let's walk through this. We start off by creating a test client and waiting for its connection to open. We then setup some variables that we'll be using for our test.

Next, we setup the client to handle messages. The response that the client receives is saved so that we can perform assertions on it later. Once the client receives the response, we close it since we no longer need to have it open. In Jest, you should always close clients when you're finished with them to avoid errors.

After that, we have our client send the test message to our WebSocket server. It's safe to do this since we waited for an open connection.

Finally, we wait for the client socket to close before performing our assertions. Note that waiting for the socket to close is critical, as we can't be guaranteed that we have all the messages we need until we know the client is finished.

And that's it! You can verify that the test succeeds by running `npx jest`. Alternatively, you can make an npm script that runs jest for you.

## Adding One More Utility for the Client

If you didn't notice from the earlier example, setting up a client without a utility function can easily get verbose and redundant as you add more tests of complex variety. There are some additional test cases worth considering, but before we dive into those, we should simplify the process of setting up a test client. We'll add these changes to `webSocketTestUtils.js`.

```javascript
// webSocketTestUtils.js

import http from "http";
import WebSocket from "ws";
import createWebSocketServer from "./createWebSocketServer";

// ...

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
```

This function creates a new client socket that connects to the specified port. It then waits for the socket connection to open before setting up an event handler.

The event handler adds any messages it receives to an array, and it closes the client when the expected number of messages -- denoted by `closeAfter` -- is received. Writing the handler this way gives us flexibility: If we're only expecting `N` messages and we want the client to close when it's finished, then we can call `createSocketClient(port, N)`. Alternatively, if we're not waiting for an explicit number of messages, we can omit `closeAfter` and supply the closing logic in our test. We'll see the benefit of this later.

The function returns the client along with any messages the client receives. This enables the test using this function to control the client's behavior and perform assertions on all of the responses.

Let's apply our new changes to the test we wrote earlier:

```javascript
// createWebSocketServer.test.js

import { startServer, waitForSocketState, createSocketClient } from "./webSocketTestUtils";

const port = 3000;

describe("WebSocket Server", () => {
  let server;

  beforeAll(async () => {
    server = await startServer(port);
  });

  afterAll(() => server.close());

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
```

This looks so much cleaner! If you add a new developer to your team and they see this code for the first time, it will read much more like plain English since the complications of callbacks and event handlers are abstracted away. Adding documentation to the testing utilities would further improve the developer experience, but I'll leave that as "extra credit".

Now about those additional test cases I mentioned...

## Covering More Test Cases (Optional)

It's great that we can test messages echoed from the WebSocket server, but that doesn't give us much to work with. What if the server is supposed to respond to 1 client message with multiple messages? What if the server is supposed to send a message to multiple clients? We need ways to test these conditions. And that's what we'll look at next.

Note: **[If you feel you've read all you need to get started, you can skip this entire section!](#brief-comments)** It's the largest one here. Otherwise, we'll be consider 3 more test cases before wrapping up:

1. The server sending multiple messages back to the client.
2. The server sending a message to multiple clients.
3. The server sending a message to multiple _specific_ clients.

Writing a test case for our WebSocket server requires our server to have code that handles said case to begin with. So as we go through each test case, we'll first update `createWebSocketServer.js` and then update `createWebSocketServer.test.js`.

### First New Test: Having the Server Send Multiple Messages

I want to refactor our `createWebSocketServer` function a little bit. Since we'll be handling multiple scenarios, we need the WebSocket server to know how to handle different kinds of messages. There are multiple ways to approach this problem. One way is to tell the server to expect an object with a `type` property and a `value` property. The `type` property will drive the behavior of the server, and the `value` property will specify the intended content of the message. For our small example, this is fine. We'll update our original code first.

```javascript
// createWebSocketServer.js

import WebSocket from "ws";

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
      }
    });
  });
}

export default createWebSocketServer;
```

Notice that we're expecting the object to come in as a JSON string that we can parse. Again, this is just one of many approaches.

Next, let's add something that causes the server to send multiple responses to the same client.

```javascript
// createWebSocketServer.js

import WebSocket from "ws";

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
        }
      }
    });
  });
}

export default createWebSocketServer;
```

In the real world, you'd probably be sending different kinds of messages instead of repeating the same one. But for the sake of our example, this will suffice. Let's update our test file next. Note that we'll have to make changes to the first test and then add our second test.

```javascript
// createWebSocketServer.test.js

import { startServer, waitForSocketState, createSocketClient } from "./webSocketTestUtils";

const port = 3000;

describe("WebSocket Server", () => {
  let server;

  beforeAll(async () => {
    server = await startServer(port);
  });

  afterAll(() => server.close());

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
});
```

You can see that our new test is not too different from our first one. This is thanks to the utility functions we created earlier!

### Second New Test: Having the Server Send a Message to Multiple Clients

For this section, we'll have the server echo the client's message to everyone who's connected. This code change is straightforward. I'll focus only on the `switch/case` statement here for brevity.

```javascript
// createWebSocketServer.js

// ...

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
}

// ...

export default createWebSocketServer;
```

And now we add our test. Again, I'll focus solely on the new code for brevity.

```javascript
// createWebSocketServer.test.js

// ...

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

// ...
```

Yet again, our new test is fairly similar to our old ones. We just had to add more clients. Notice that due to the nature of the test, only 1 client needed to send a message.

The value of our utility functions can't be missed here: Without `createSocketClient`, we'd be repeating a lot of the same code several times. And if we weren't using a promise-based utility like `waitForSocketState`, we'd have to use callbacks _in every place where we wait for a given socket state_. This includes all calls that appear in `createSocketClient`, which means that trying to reconcile starting and closing all the clients at the proper time would become a nightmare; we'd end up with lots of confusing callback nesting. I meant it when I said the utility functions were the most significant part here.

### Third New Test: Having the Server Send a Message to Multiple _Specific_ Clients

This example is a little more ambitious. We'll be creating a fake group chat. Clients who connect to the WebSocket server will be able to create a group, join a group, and send a message to their group. When a message is sent to a group, only the clients in that group (including the sender) will receive the message. This will require adding 3 additional cases to our `switch/case` statement from earlier.

```javascript
// createWebSocketServer.js

import WebSocket from "ws";
import { Server } from "http";

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
```

Here, we've added a `groupNames` array to keep track of all the groups that currently exist. When a person creates a new group, it's added to `groupNames`. If the group's name is taken, the client gets an error message. Clients seeking to join a group must use a name that is already in `groupNames`. Invalid names will result in an error message from the server. Successfully joining/creating a group will return the requested group name as confirmation of success.

Finally, whenever a group message is sent, the message is returned to all clients associated with that group name. The message will only go through if it was sent by a client who was already in the group.

Remember that this is an example for the sake of showing potential ways to write tests. A more realistic WebSocket server would be more complex. For instance, it would provide a unique identifier for each group, delete a group when no more clients are associated with it, and more.

We have enough to get us going, so we can finally write our last test now. The trick here is keeping track of the order of events. A client can't join a group that doesn't exist, so we need to make sure that anyone trying to join a group does so _after_ it is created. Let's see what a potential test could look like:

```javascript
// createWebSocketServer.test.js

// ...

test("When given a MESSAGE_GROUP message, the server echoes the message it receives to everyone in the specified group", async () => {
  // Create test clients
  const [client1, messages1] = await createSocketClient(port);
  const [client2, messages2] = await createSocketClient(port, 2);
  const [client3, messages3] = await createSocketClient(port);
  const creationMessage = { type: "CREATE_GROUP", value: "TEST_GROUP" };
  const testMessage = "This is a test message";

  // Setup test clients to send messages and close in the right order
  client1.on("message", (data) => {
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

// ...
```

This test is still fairly similar to our previous ones. The only difference here is the addition of event handlers to control the order of events. There are a few things worth calling attention to.

First, as I mentioned earlier, it's impossible to join a group that doesn't exist. `client1`'s event handler allows us to join a group and send messages to it after we know for sure that a group has already been created.

Second, we've chosen `client2` as the "key pillar" of the test. It's responsible for joining a group and sending a message to everyone in the group. For us to be sure that the group message was only received by the correct clients, we should only close `client1` and `client3` after `client2` is finished. Thus, instead of providing the `closeAfter` argument for `client1` and `client3`, we let `client2` be responsible for closing the other clients. This is the benefit of keeping our `createSocketClient` utility flexible.

Finally, `client1` puts everything in motion by creating a group. After this, we do what we've always done: We wait for all the sockets to close and perform assertions on the responses we received.

You'll notice that although we added a couple new features to our WebSocket server, we've only created a test for one scenario. I'll leave testing the other scenarios as an exercise if you're up for it. Most of the other ones are of similar or easier difficulty.

## Brief Comments

I'll quickly comment on 3 things before wrapping up.

### 1) Using Unique Port Numbers in Server Tests

If you're using a WebSocket server, it's likely that you have a real, sophisticated http/s server that handles requests. As regards testing servers, just as it's easier to separate your integration tests for your different server routes, it's also probably best to separate your WebSocket tests into their own space. And if you're running all your tests simultaneously, you'll want to make sure that each instance of your server is using its own unique port to avoid errors.

One way to handle this issue is by doing the following:

```javascript
const port = 3000 + Number(process.env.JEST_WORKER_ID);
```

Of course, you can use a number besides 3000 if you want.

### 2) Managing the Order of Your WebSocket Tests

If you read the optional portion of this article, you saw that there may be situations where you have to control the order in which your clients send messages. This is always doable if you set up event handlers, but try to do so as cleanly as possible.

### 3) Make Each of Your Tests Specific to the Message Type You're Focusing on

Whenever you create an application involving some kind of group or lobby, your tests become heavily event dependent. For instance, before you can test sending a message to a group, it is first necessary for one client to create a group and for another client to join the group.

I strongly recommend _against_ meshing test assertions in this situation. For instance, a test about sending a message to the group _should not_ perform assertions on whether the group was correctly created or joined. Instead, create separate test cases for verifying that creating or joining a group works properly. Then, in your test about sending a message, you can focus solely on how the group message was handled.

Alternatively, you can create one large test that "goes through the entire flow" of creating, joining, and messaging a group. You get less code duplication, but you also get a larger test; so consider the trade-offs. WebSockets are still a beast since they are event driven, so every act of organization helps.

## Summary

And now we're finally done! In this article, we learned how to create integration tests for WebSocket servers, and we created a few utility functions to greatly simplify this process. Let me know what you thought! I want to make sure this is a sufficient example on writing integration tests for WebSocket servers, so all questions and critiques (and appreciations xD) are welcome!

As I said at the beginning, this article and the code for its examples can be found on [github](). There, I have a JavaScript version and a TypeScript version of the codebase. Both use JSDocs to make life a little easier if you decide to play around.

I want to give a special thanks to stackoverflow users [user3215378 and Dmitry Taipov](https://stackoverflow.com/a/21394730) for the inspiration I got for `waitForSocketState`, and to stackoverflow users [FleMo and Timo Tijhof](https://stackoverflow.com/a/55963641) for the inspiration I got for `createSocketClient`. I also want to thank Kent C. Dodds for his insights into writing integration tests. If you're interested, you can find his courses on testing JavaScript [here](https://testingjavascript.com/). He didn't touch on testing WebSocket servers, but he did provide the inspiration for me to try this after several headaches.
