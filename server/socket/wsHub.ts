import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

interface TrackedSocket {
  ws: WebSocket;
  facilityId: string;
}

class WsHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<TrackedSocket>();

  attach(server: HttpServer): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '/ws', 'http://localhost');
      const initialFacility = url.searchParams.get('facilityId') || 'vja-hospital';
      const tracked: TrackedSocket = { ws, facilityId: initialFacility };
      this.clients.add(tracked);

      ws.send(
        JSON.stringify({
          event: 'ws:connected',
          facilityId: initialFacility,
          timestamp: Date.now(),
        })
      );

      ws.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString()) as {
            type?: string;
            facilityId?: string;
          };
          if (parsed.type === 'subscribe' && parsed.facilityId) {
            tracked.facilityId = parsed.facilityId;
          }
        } catch {
          // Ignore malformed client frames
        }
      });

      ws.on('close', () => {
        this.clients.delete(tracked);
      });

      ws.on('error', () => {
        this.clients.delete(tracked);
      });
    });
  }

  broadcast(facilityId: string, event: string, payload: unknown): void {
    if (this.clients.size === 0) return;
    const message = JSON.stringify({
      event,
      facilityId,
      payload,
      timestamp: Date.now(),
    });

    for (const client of this.clients) {
      if (
        client.facilityId === facilityId &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(message);
      }
    }
  }
}

export const wsHub = new WsHub();
