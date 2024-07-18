import http from "http";
import { WebSocket } from "ws";
import type { MessageEvent } from "ws";
import createWebSocketServer from "./createWebSocketServer.js";

/**
 * Creates and starts a WebSocket server from a simple http server for testing purposes.
 * @param port Port for the server to listen on
 * @returns The created server
 */
export function startServer(port: number): Promise<http.Server> {
  const server = http.createServer();
  createWebSocketServer(server);

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

export class TestWebSocket extends WebSocket {
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

  /** The stored messages that the `WebSocket` has received (and not yet {@link clearMessages cleared}). */
  get messages(): string[] {
    return this.#messages.slice();
  }

  /** Clears all of the stored {@link messages} that were previously received by the `WebSocket`. */
  clearMessages(): void {
    this.#messages.splice(0, this.#messages.length);
  }

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

  /**
   * Waits until the `WebSocket` receives the specified `message`.
   * @param message
   * @param includeExistingMessages Indicates that the {@link messages} currently stored by the WebSocket should
   * be checked before waiting for new messages. Defaults to `true`.
   * @param timeout The time (in `milliseconds`) to wait for the desired `message`. Defaults to `1000ms`.
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
