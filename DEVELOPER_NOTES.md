# Developer Notes

These notes are intended to give you (and me) insight into the design decisions that I made regarding my articles. I want to be able to look back and learn from my previous experiments and mistakes. This document helps me to do that.

## Don't Implement a "`take`" Method for the `TestWebSocket` Client

My original design for the 2nd iteration of the WebSocket client helpers did not include a `messages` getter, nor a `waitForMessageCount` method, nor a `waitForMessage` method. Instead, it included a `takeNextMessages(count, timeout)` method. As one would guess, this method would wait until the client received `N` messages, and those messages would be returned in an array. If the `TestWebSocket` already contained _at least_ `N` messages in its internal state, then the next `N` messages would be returned synchronously. (If the client had only received `0 < X < N` messages, then the process would wait until an additional `N - X` messages were received.) Additionally, the messages that were "taken" would be removed from the `TestWebSocket`'s internal state. (That way, `takeNextMessages` would never return stale data.) Finally, a `timeout` argument could be provided to prevent the process from waiting forever. (The default value would be `1000ms`.)

In the end, I concluded that this approach was too limiting. The `takeNextMessages` helper by itself would not enable developers to wait until a _specific_ message was received. Instead, it assumed that developers would _always_ know how many messages need to be taken to reach the _actual_ desired message.

Another issue with this approach is that concurrent `Promise`s could become hard to predict or reason about. In other words, this gets iffy:

```ts
const messagesPromise1 = client.takeNextMessages(3);
const messagesPromise2 = client.takeNextMessages(3);

await Promise.all([messagesPromise1, messagesPromise2]);
```

Now hopefully no one would try this to begin with... But the `waitForMessage` and `waitForMessageCount` methods would never run into this problem.

The `messages` getter that returned an untamperable array, the `waitForMessageCount` method, and the `waitForMessage` method all seemed like much more flexible options that handled what `takeNextMessages` could do and more; so I deprecated `takeNextMessages` in favor of those 3. I also added a `clearMessages` method in case it was needed.

Looking back, I suppose that I could've created a `takeNextMessages` helper _alongside_ `messages`, `clearMessages`, `waitForMessage`, and `waitForMessageCount`. It would basically provide a more granular way of clearing the stored messages. But I'm not sure how important of a use case that is... I leave that for other developers to add as they see fit. However, if this is implemented, it would probably be best to keep `takeNextMessages` synchronous...
