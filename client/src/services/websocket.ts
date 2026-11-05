import { getAuthToken } from './api.ts';

type Listener = (data: any) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();
  private reconnectTimer: any = null;
  private currentConversationId: string | null = null;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = getAuthToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
    const wsUrl = `${protocol}//${host}/ws${tokenQuery}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected to server');
      if (this.currentConversationId) {
        this.subscribe(this.currentConversationId);
      }
      this.emit('connection_change', { connected: true });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type) {
          this.emit(data.type, data);
        }
        this.emit('*', data);
      } catch (err) {
        console.error('[WS] Parse error', err);
      }
    };

    this.ws.onclose = (event) => {
      console.log('[WS] Disconnected, code:', event.code, event.reason);
      this.emit('connection_change', { connected: false });
      if (event.code === 4001) {
        // Unauthorized
        this.emit('auth_error', { message: 'WebSocket unauthorized' });
        return; // Don't reconnect immediately if unauthorized
      }
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error', err);
      this.ws?.close();
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  subscribe(conversationId: string) {
    this.currentConversationId = conversationId;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', conversationId }));
    }
  }

  unsubscribe() {
    this.currentConversationId = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe' }));
    }
  }

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: string, listener: Listener) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
  }

  private emit(event: string, data: any) {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch (e) {
          console.error('[WS] Listener error', e);
        }
      }
    }
  }
}

export const wsClient = new WebSocketClient();
