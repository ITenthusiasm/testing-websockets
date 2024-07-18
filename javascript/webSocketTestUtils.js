import http from "http";
import { WebSocket } from "ws";
import createWebSocketServer from "./createWebSocketServer.js";

/**
 * Creates and starts a WebSocket server from a simple http server for testing purposes.
 * @param {number} port Port for the server to listen on
 * @returns {Promise<import("node:http").Server>} The created server
 */
export function startServer(port) {
  const server = http.createServer();
  createWebSocketServer(server);

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

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

  /** @returns {string[]} The stored messages that the `WebSocket` has received (and not yet {@link clearMessages cleared}). */
  get messages() {
    return this.#messages.slice();
  }

  /** Clears all of the stored {@link messages} that were previously received by the `WebSocket`. @returns {void} */
  clearMessages() {
    this.#messages.splice(0, this.#messages.length);
  }

  /**
   * Waits until the `WebSocket` enters the specified `state`.
   * @param {"open" | "close"} state
   * @param {number} [timeout] The time (in `milliseconds`) to wait for the desired `state`. Defaults to `1000ms`.
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

  /**
   * Waits until the `WebSocket` receives the specified `message`.
   * @param {string} message
   * @param {boolean} [includeExistingMessages] Indicates that the {@link messages} currently stored by
   * the WebSocket should be checked before waiting for new messages. Defaults to `true`.
   * @param {number} [timeout] The time (in `milliseconds`) to wait for the desired `message`. Defaults to `1000ms`.
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

  /**
   * Waits until the `WebSocket` holds the specified number of stored {@link messages} (or more).
   * @param {number} count
   * @param {number} [timeout] The time (in `milliseconds`) to wait for the desired message `count`. Defaults to `1000ms`.
   * @returns {this["messages"] | Promise<this["messages"]>} the `WebSocket`'s stored {@link messages}.
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
