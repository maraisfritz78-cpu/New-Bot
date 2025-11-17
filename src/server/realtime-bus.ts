import { EventEmitter } from 'events';

// A singleton bus for publishing realtime events to all SSE clients
class RealtimeBus extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners to avoid warnings; SSE connections can add many listeners
    this.setMaxListeners(50);
  }
}

export const realtimeBus = new RealtimeBus();
