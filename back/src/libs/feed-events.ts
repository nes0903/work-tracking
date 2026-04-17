import { EventEmitter } from "node:events";

export type FeedSource = "notion" | "github";

export interface FeedUpdateEvent {
  source: FeedSource;
  at: string;
}

const EVENT_NAME = "feed-update";

class FeedEventBus extends EventEmitter {}

const bus = new FeedEventBus();
bus.setMaxListeners(0);

export function emitFeedUpdate(source: FeedSource) {
  const event: FeedUpdateEvent = {
    source,
    at: new Date().toISOString(),
  };
  bus.emit(EVENT_NAME, event);
}

export function onFeedUpdate(listener: (event: FeedUpdateEvent) => void) {
  bus.on(EVENT_NAME, listener);
  return () => {
    bus.off(EVENT_NAME, listener);
  };
}
