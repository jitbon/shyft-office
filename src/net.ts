import type { ClientMsg, ServerMsg } from '../shared/protocol';

/** WebSocket client that reconnects with backoff and re-joins automatically. */
export class Net {
  onMessage: (msg: ServerMsg) => void = () => {};
  onStatus: (online: boolean) => void = () => {};
  private ws: WebSocket | null = null;
  private join: ClientMsg | null = null;
  private retryMs = 500;

  connect(join: ClientMsg) {
    this.join = join;
    this.open();
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private open() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retryMs = 500;
      ws.send(JSON.stringify(this.join));
      this.onStatus(true);
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(e.data));
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onStatus(false);
      setTimeout(() => this.open(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 10000);
    };
  }
}
