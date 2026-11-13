import { useEffect, useRef } from 'react';

export interface QueueWsMessage {
  event: string;
  facilityId: string;
  payload?: unknown;
  timestamp: number;
}

export function useQueueSocket(
  facilityId: string,
  onEvent: (msg: QueueWsMessage) => void
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws?facilityId=${encodeURIComponent(
        facilityId
      )}`;

      socket = new WebSocket(url);

      socket.onopen = () => {
        socket?.send(JSON.stringify({ type: 'subscribe', facilityId }));
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as QueueWsMessage;
          onEventRef.current(parsed);
        } catch {
          // Ignore malformed server payload
        }
      };

      socket.onclose = () => {
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [facilityId]);
}
