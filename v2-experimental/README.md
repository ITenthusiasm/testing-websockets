# Revisiting My Approach for Testing WebSocket Servers

About 3 years ago, I wrote an [article](TODO: Link to GitHub markdown file) explaining how to test WebSocket servers (sanely) with [`ws`](https://github.com/websockets/ws) and [`jest`](https://jestjs.io). Back then, I was very happy with my approach because it enabled me to write tests in a way that was more readable and more maintainable than many other alternatives out there. However, after coming back to that article some years later, I discovered some flaws in my previous way of doing things. Now I believe that a different approach would vastly improve the readability/maintainability of developers' WebSocket tests.

In this article, I want to go over the shortcomings of my previous approach, and the benefits of my new one. I know how difficult it can be to write good integration tests for WebSocket servers, so I want to make sure that the solution which I give to you all is as helpful and clear as possible.

## Recap: The Structure of the Old Utility Functions

To understand what was wrong with the previous implementation, we need to see what it actually looked like. Below are the two helper functions that I created to help with testing WebSocket servers. I've also included some JSDocs to bring additional clarity to what these functions do.

```js
import { WebSocket } from "ws";

/**
 * Forces a process to wait until the socket's `readyState` becomes the specified value.
 * @param {WebSocket} socket The socket whose `readyState` is being watched
 * @param {number} state The desired `readyState` for the socket
 * @returns {Promise<void>}
 */
export function waitForSocketState(socket, state) {
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
 * Creates a socket client that connects to the specified `port`. If `closeAfter` is specified,
 * the client automatically closes the connection after it receives the specified number of messages.
 * @param {number} port The port to connect to on `localhost`
 * @param {number} [closeAfter] The number of messages to receive before closing the connection
 * @returns {Promise<[WebSocket, string[]]>} Tuple containing the created client and any messages it receives
 */
export async function createSocketClient(port, closeAfter) {
  const client = new WebSocket(`ws://localhost:${port}`);
  await waitForSocketState(client, client.OPEN);
  const messages = [];

  client.on("message", (data) => {
    messages.push(data.toString("utf8"));
    if (messages.length === closeAfter) client.close();
  });

  return [client, messages];
}
```

The `waitForSocketState` function was created to enable developers to wait until a WebSocket client was `OPEN` or `CLOSED`. However, it wasn't enough on its own to save developers from callback pains. Another utility function was needed to make it easier to read the messages received by a WebSocket client. And that's where the `createSocketClient` function came in.

Basically, the `createSocketClient` function automatically registers a `message` event listener with a newly-created WebSocket. Using that listener, the function exposes all of the messages that the client receives through the returned `messages` variable. If the developer only expects the client to receive `N` messages, they can pass that number to the `closeAfter` argument. In that case, the client will automatically be closed after it receives `N` messages.

Finally, as an added "bonus", the `createSocketClient` function waits for the created client to open a connection. This way, you can "know" that your WebSocket client is "safe" to use after the function finishes. (Notice the quotation marks. This function was not as safe as I originally assumed, but we'll get into that later.)

Now that we've done our quick recap, let's address the problems with this approach.

## Problem 1: The Resulting Test Code Is Still Hard to Follow

The purpose of these utility functions was to make tests for WebSocket servers easier to write and maintain. However, that goal was only partially achieved -- and not in a satisfactory way.

When you're testing only 1 WebSocket client at a time, these utility functions allow you to write _somewhat_ readable/maintainable code:

```js
test("When given an ECHO message, the server echoes the message it receives from the client", async () => {
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
```

However, these utility functions require developers to write their tests in an odd and unintuitive way. For example, why do I have to wait until _after_ the client is `CLOSED` to start performing assertions on the messages that were received? Will a developer who's new to the codebase (or one who's returning to it) be able to understand that requirement (and everything else) at a first glance? Unlikely.

The code written for the test above is a little agitating, but it isn't completely unbearable. However, the code _quickly_ becomes unbearable once you start introducing complex use cases. Consider a scenario where we want to test a simple Group Chat Room. In the past, I used my utility functions to write something similar to what you see below. (**Do not take more than 30-60 seconds trying to understand the code.**)

```js
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

  const [groupCreationMessage, message1] = messages1;
  const [groupJoinMessage, message2] = messages2;

  // Both client1 and client2 should have joined the same group.
  expect(groupCreationMessage).toBe(`GROUP_CREATED: ${creationMessage.value}`);
  expect(groupJoinMessage).toBe(`GROUP_JOINED: ${creationMessage.value}`);

  // Both client1 and client2 should have received the group message.
  expect(message1).toBe(testMessage);
  expect(message2).toBe(testMessage);

  // client3 should have received no messages
  expect(messages3.length).toBe(0);
});
```

Well, did you understand the code above by looking at it for just 30 seconds? If you did, kudos! If you didn't, I don't blame you. What exactly is this code doing? Well, it's _trying_ to do this:

1. Create all (3) test clients.
2. Have `client1` create a group.
3. Have `client2` join the group that `client1` created.
4. Have `client2` send a message to the whole group. (It should receive the message that it sent as confirmation of success.)
5. Verify that `client3` didn't receive any messages since it never created or joined a group.

That process sounds pretty simple, so why is the code so complicated? Well, the complications arise for two primary reasons.

**First**, our utility functions are insufficient: They don't give us a way to read the messages that WebSocket clients receive in a clear, _sequential_ order. Consequently, we're thrown right back into callback torture when we start working with our Group Chat Room. `client2` can't join `TEST_GROUP` until `client1` creates it. So we have to register a `message` event listener with `client1` which tells `client2` to join `TEST_GROUP` after `client1` creates it. This is icky...

Also note that this code is a little unsafe. We're _assuming_ that `client2` succeeds when it sends the `joinMessage` message to the server. But what if it fails? Can we write an assertion which verifies that `client2` successfully joined the group (e.g., by checking for a received confirmation message)? We could... and we should... but that would require more callbacks...

What's coming out here is that we're missing a utility function that helps us read client messages in a clear, _sequential_, predictable order -- without the crazy callbacks.

**Second**, our utility functions are still causing us to write code in an awkward and unintuitive way. Again, we can't verify that our clients have received _all_ of the expected messages until _all_ of them are `CLOSED`. Moreover, only `client2` "knows" how many messages it should receive. So we have to set up another event listener that closes `client1` and `client3` after `client2` closes. This is icky...

Are you starting to see why the utility functions that I provided in the past may not have been the best?

## Problem #2: The Utilities Opened the Door for Unexpected Race Conditions

When I originally wrote my utility functions, I wrote them under the assumption that the server would not send any WebSocket messages until at least one client sent a message first. However, I soon discovered that other people wanted to test the _exact opposite_ scenario: They wanted the server to send a message to the client _immediately_ after the client connected -- before the client sent any messages down. But when they tried to test this use case with my utility functions, they encountered race conditions. These race conditions could have been avoided if the functions that I provided were written more robustly.

There are other things that were wrong with my previous approach, but the two aforementioned concerns are the most problematic. Let's discuss a new approach that gives us a lot more flexibility with signficiantly fewer headaches.

## The New Approach

Having examined my previous mistakes, I have obtained a clearer picture of what my new helper functions need. My new helper functions need to:

1. Provide a better interface for managing the messages that WebSocket clients receive
2. Prevent race conditions (and/or make them "recoverable")
3. Replace dodgy uses of `setTimeout` with event listeners
4. Make tests significantly more readable and maintainable
5. Be readable and maintainable themselves

Note that although these goals may sound great on the surface, they require noticeably more work than my previous implementation. You will need a basic understanding of [`Promise`s](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) and [event listeners](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events) in order to understand my new approach. (Or you will need to be willing to learn from the example code that you see in this article.) Thankfully, you do not need to understand the new implementation in order to _use_ it for your tests. However, you won't be able to tailor my approach more closely to your needs until you understand these topics.

Although the new implementation requires more effort, the effort is more than worth it! I'm confident that you'll agree with me when you see how the new approach improves our tests.

Note: All of my code will be written in TypeScript this time.

### 1&rpar; Extend the `WebSocket` Class from `ws`

First off, we're going to implement our "utility functions" a little differently. Instead of creating individual functions that operate on a WebSocket client, we're going to extend the `WebSocket` class and attach our helpers to that:

```ts
import { WebSocket } from "ws";

class TestWebSocket extends WebSocket {}
```

Why do things this way? Because this approach makes it easier to track the information associated with a given client. For example, let's say that I want to track the messages that several WebSocket clients have received. To me, it's much easier if I can get that information from the clients themselves.

```ts
client1 = new TestWebSocket(url);
client2 = new TestWebSocket(url);
client3 = new TestWebSocket(url);

console.log(client1.messages);
console.log(client2.messages);
console.log(client3.messages);
```

This is clearer than creating (and keeping track of) separate `messages` variables that are related to the different WebSocket clients.

```ts
[client1, messages1] = createSocketClient(url);
[client2, messages2] = createSocketClient(url);
[client3, messages3] = createSocketClient(url);

console.log(messages1);
console.log(messages2);
console.log(messages3);
```

If you disagree with me, that's fine. You are more than welcome to create functional alternatives to what I show you in this article.

### 2&rpar; Tracking the Client's Messages

My previous implementation made it possible for some of a client's received messages to be missed if the `message` event listener wasn't registered in time. To solve that problem, we're going to register the `message` event listener when our `TestWebSocket` class is instantiated.

```ts
class TestWebSocket extends WebSocket {
  #messages: string[] = [];

  constructor(...args: ConstructorParameters<typeof WebSocket>) {
    super(...args);
    const addNewMessage = (event: MessageEvent): void => {
      const data = event.data.toString("utf8");
      this.#messages.push(data);
    };

    this.addEventListener("message", addNewMessage);
    this.addEventListener("close", () => this.removeEventListener("message", addNewMessage), { once: true });
  }
}
```

The code above is pretty straightforward: The `addNewMessage` function converts all of the messages that a WebSocket client receives into strings. Then it stores those strings internally for later use. This function is registered as a `message` event handler.

We don't want to keep the `message` event handler registered if the WebSocket client is `CLOSED`; so when the client closes, we remove the `addNewMessage` event handler. We accomplish this with a `close` event handler. And since we're using the `once` option for the `close` event handler, it will automatically be unregistered once it gets triggered. This approach will protect our tests from accidentally creating "dangling event handlers".

To expose the client's received messages to our tests, we can use a [getter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get):

```ts
class TestWebSocket extends WebSocket {
  #messages: string[] = [];
  // constructor() { ... }

  get messages() {
    return this.#messages.slice();
  }
}
```

**_A [`setter`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/set) was intentionally excluded here_** to prevent the outside world from corrupting the message data. **_The use of [`Array.slice`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice) here is also intentional_**, as it will prevent the outside world from mutating the _original_ array of messages.

If any tests need to alter a client's message data for any reason, we can expose methods that allow these operations to be done safely and predictably. For example, if a test wants to "forget" the messages that a WebSocket client received, we can provide a `clearMessages` method:

```ts
class TestWebSocket extends WebSocket {
  #messages: string[] = [];
  // constructor() { ... }

  /** The stored messages that the `WebSocket` has received (and not yet {@link clearMessages cleared}). */
  get messages(): string[] {
    return this.#messages.slice();
  }

  /** Clears all of the stored {@link messages} that were previously received by the `WebSocket`. */
  clearMessages(): void {
    this.#messages.splice(0, this.#messages.length);
  }
}
```

These utilities provide all that we need to manage the messages that a WebSocket client receives.

### 3&rpar; Waiting for the Client to `open`/`close`

Next up, we need a way to wait until a client is `OPEN` (or `CLOSED`). That way, we can know when it's safe to call methods like `client.send()`. We'll call this method `waitUntil`; it will be much more sophisticated than the previous `waitForSocketState` function.

```ts
class TestWebSocket extends WebSocket {
  #messages: string[] = [];
  // constructor() { ... }
  // get messages() { ... }
  // clearMessages() { ... }

  /**
   * Waits until the `WebSocket` enters the specified `state`.
   * @param state
   * @param timeout The time (in `milliseconds`) to wait for the desired `state`. Defaults to `1000ms`.
   */
  waitUntil(state: "open" | "close", timeout = 1000): void | Promise<void> {
    if (this.readyState === this.OPEN && state === "open") return;
    if (this.readyState === this.CLOSED && state === "close") return;

    return new Promise((resolve, reject) => {
      let timerId: NodeJS.Timeout | undefined;
      const handleStateEvent = (): void => {
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

I hope that this code doesn't intimidate you! Remember: One of our primary goals is to "Prevent race conditions (and/or make them 'recoverable')". The price to pay for satisfying that requirement is writing more defensive code. However, by writing this defensive code, we'll end up with tests that are more clear and more consistent! Let's walk through each part of this `waitUntil` method.

**First**: If the client is already `OPEN` (or `CLOSED`), then we don't create a `Promise`. Instead, the method simply returns synchronously. This approach prevents us from generating unnecessary `Promise`s. As a result, it adds some protection against race conditions. (For the clever among you: No, the `setTimeout` call is not enough protection.)

**Second**: If the client was _not_ already `OPEN` (or `CLOSED`) when `waitUntil` was called, then we return a `Promise`. Inside this `Promise` we create a one-time `open` (or `close`) event handler that will immediately resolve the `Promise` when triggered.

**Third**: We provide the ability for `waitUntil` to timeout. If the client takes too long to `open` (or `close`), then the `Promise` that we return will `reject` with a Timeout Error. This provides a much better DX for test writers. Callers of `waitUntil` also have the ability to control how long the process should wait before timing out.

Note that it is _theoretically_ possible for a WebSocket client to `open` (or `close`) _after_ the returned `Promise` is created but _before_ the corresponding event handler is registered. In that (rare) scenario, we "recover" from the race condition by `resolv`ing the `Promise` if the client is in the proper `readyState` when the timeout function is executed.

**Fourth**: Cleanup. If our returned `Promise` resolves, then the timeout function is cleared because it is no longer needed. If the timeout function is executed, then the unused event handler is unregistered because it is no longer relevant.

Sidenote: Some of you may have realized that the synchronous check at the beginning of `waitUntil` is _technically_ unnecessary. This is because our timeout function can handle scenarios where the client is `OPEN` (or `CLOSED`) before the `handleStateEvent` function is registered. However, there are two problems with relying on that assumption:

1. A test should not force a process to wait for 1000+ milliseconds unnecessarily.
2. For developers who are doing _very_ clever things with `Promise`s, _other_ unexpected race conditions could arise from not handling this scenario synchronously. When testing WebSockets, it is simply best to avoid adding something to the [Event Loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop) whenever possible.

### 4&rpar; Waiting for Specific Client Messages

With our `waitUntil` method and our `messages` getter, we have effectively replaced `waitForSocketState` and `createSocketClient` with new utilities that are less prone to race conditions. However, we still need to "provide a better interface for managing the messages that WebSocket clients receive". Specifically, we need a way to read client messages in a clear, _sequential_, predictable way.

One way to accomplish this is to write a method that allows us to wait until a _specific_ message has been received by the client:

```ts
class TestWebSocket extends WebSocket {
  #messages: string[] = [];
  // constructor() { ... }
  // get messages() { ... }
  // clearMessages() { ... }
  // waitUntil() { ... }

  /**
   * Waits until the `WebSocket` receives the specified `message`.
   * @param message
   * @param includeExistingMessages Indicates that the {@link messages} currently stored by the WebSocket should
   * be checked before waiting for new messages. Defaults to `true`.
   * @param timeout The time (in `milliseconds`) to wait for the desired `message` to appear. Defaults to `1000ms`.
   */
  waitForMessage(message: string, includeExistingMessages = true, timeout = 1000): void | Promise<void> {
    if (includeExistingMessages && this.#messages.includes(message)) return;
    const originalMessageIndex = this.#messages.lastIndexOf(message);

    return new Promise((resolve, reject) => {
      let timerId: NodeJS.Timeout | undefined;
      const checkForMessage = (event: MessageEvent): void => {
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

Again, the price for writing clearer, more maintainable, less-race-condition-prone tests is having more defensive helper methods. Let's walk through what we're doing here. It shouldn't be too complicated since this approach is _very similar_ to our approach in `waitUntil`.

**First**: If the client has already received the desired message, then we return synchronously _as long as the `includeExistingMessages` option is `true`_. It's theoretically possible that a client could receive the same message multiple times. If the stored messages have not been cleared and the developer is anticipating a _new_ message matching the provided string, then they can set `includeExistingMessages` to `false` to handle that use case.

As with `waitUntil`, our approach here prevents us from generating unnecessary `Promise`s.

**Second**: If the client has _not_ already received the desired message (or if the developer wants to wait for a _new_ message), then we return a `Promise`. Inside this `Promise` we create a `message` event handler called `checkForMessage`. When this event handler receives a message matching the desired value, it will `resolve` the `Promise` and unregister itself. (Unregistering the event handler allows us to avoid causing memory leaks.)

**Third**: We provide the ability for `waitForMessage` to timeout. If the client takes too long to receive the desired message, then the `Promise` that we return will `reject` with a Timeout Error. This provides a much better DX for test writers. Callers of `waitForMessage` also have the ability to control how long the process should wait before timing out.

In the _unlikely_ scenario where a WebSocket client receives the desired message _after_ the returned `Promise` is created but _before_ the corresponding event handler is registered, we "recover" the race condition by `resolv`ing the `Promise`.

**Fourth**: Cleanup. If our returned `Promise` resolves, then the timeout function is cleared because it is no longer needed. If the timeout function is executed, then the unused event handler is unregistered because it is no longer relevant. As with before, we take responsibility for cleaning up our timers and event listeners in all circumstances.

Just like I said earlier, the general concept behind our `waitForMessage` helper is very similar to the one we used for our `waitUntil` helper. So does it really provide that much value? **Yes! Incredibly so!** Remember the awkward code that we wrote for our Group Chat Room test?

```js
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

  const [groupCreationMessage, message1] = messages1;
  const [groupJoinMessage, message2] = messages2;

  // Both client1 and client2 should have joined the same group.
  expect(groupCreationMessage).toBe(`GROUP_CREATED: ${creationMessage.value}`);
  expect(groupJoinMessage).toBe(`GROUP_JOINED: ${creationMessage.value}`);

  // Both client1 and client2 should have received the group message.
  expect(message1).toBe(testMessage);
  expect(message2).toBe(testMessage);

  // client3 should have received no messages
  expect(messages3.length).toBe(0);
});
```

Well, compare _that_ with what our tests look like when using our _new_ helper methods:

```ts
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
```

This is **_vastly_** more readable than the old version! (The new version is almost **_half_** the lines of code by the way.) Note that if you don't like using [`Promise.all`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all), then you can `await` the `Promise`s at the beginning sequentially:

```ts
await client1.waitUntil("open");
await client2.waitUntil("open");
await client3.waitUntil("open");
```

However, it's typically faster (and recommended) to use `Promise.all` in this case.

### 5&rpar; Waiting for a Certain Number of Messages

In the previous section, I said that we wanted to "provide a better interface for managing the messages that WebSocket clients receive". We technically accomplished this with our `waitForMessage` function. But there may be other scenarios where a developer simply wants to wait until a WebSocket client has received a certain _number_ of messages. Now that we've written `waitUntil` and `waitForMessage`, it should be easy for us to write something that satisfies this use case:

```ts
class TestWebSocket extends WebSocket {
  #messages: string[] = [];
  // constructor() { ... }
  // get messages() { ... }
  // clearMessages() { ... }
  // waitUntil() { ... }
  // waitForMessage() { ... }

  /**
   * Waits until the `WebSocket` holds the specified number of stored {@link messages} (or more).
   * @param count
   * @param timeout The time (in `milliseconds`) to wait for the desired message `count`. Defaults to `1000ms`.
   * @returns the `WebSocket`'s stored {@link messages}.
   */
  waitForMessageCount(count: number, timeout = 1000): this["messages"] | Promise<this["messages"]> {
    if (this.#messages.length >= count) return this.messages;

    return new Promise((resolve, reject) => {
      let timerId: NodeJS.Timeout | undefined;
      const watchMessageCount = (): void => {
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

At this point, you should be seeing a pattern. I'm assuming that I don't have to explain what the code above is doing this time.

The only thing worth noting is that this time we're returning the WebSocket client's messages when `waitForMessageCount` finishes. **_And since we don't want callers to be able to mutate the client's state, we only `return` or `resolve` with `this.messages` instead of `this.#messages`._** (Remember that the getter, `this.messages`, returns a _copy_ of the message array so that the original data can't be mutated.)

Remember the `ECHO_TIMES_3` test that I wrote in my previous article? You probably don't. The code below is what it looked like in the past. (This test uses the _old_ helper functions.)

```js
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
```

This code is bearable. But again, it isn't as clear or intuitive as it could be. We can make this test much more maintainable by using `waitForMessageCount`:

```ts
test("When given an ECHO_TIMES_3 message, the server echoes the message it receives from client 3 times", async () => {
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

This is the last helper method that we'll be writing in this article. However, you are more than welcome to add additional helpers to fit your needs. My only caution would be this: Since the `TestWebSocket` class depends on event listeners, you should be careful when calling [removeAllListeners](https://nodejs.org/api/events.html#emitterremovealllistenerseventname) on your `TestWebSocket`s. In fact, I would recommend not calling that method at all. (The large majority of you will not need to be concerned about this.)

## Wrap-up

That's it, everyone! After going through this refactoring exercise, I've concluded that [ThePrimeagen](https://www.youtube.com/@ThePrimeTimeagen) was right: The code that I wrote 3 years ago is now code that I think is bad. But I wouldn't have learned how to improve that code if I hadn't made those mistakes first. I wonder what I'll think of my new approach 3-5 years from now. Hopefully I'll at least be able to say that these new helpers result in tests that are sufficiently readable!

What about you? What would you say? I would love to hear your thoughts about this new approach in the comments! If the community considers these new helpers to be superior to my old ones, then I will rewrite my original article to use the new code as well. (This will protect people from experiencing the same pitfalls that I did.) Let me know what you think!
