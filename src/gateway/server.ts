import http from 'node:http';

/**
 * Configuration for the Gateway server.
 */
export interface GatewayServerConfig {
  port: number;
  host: string;
}

/**
 * Default Gateway server configuration.
 */
export const DEFAULT_GATEWAY_CONFIG: GatewayServerConfig = {
  port: 3000,
  host: '127.0.0.1',
};

export class GatewayServer {
  private server: http.Server;
  private config: GatewayServerConfig;
  private running: boolean = false;

  constructor(config: Partial<GatewayServerConfig> = {}) {
    this.config = { ...DEFAULT_GATEWAY_CONFIG, ...config };
    this.server = http.createServer(this.handleRequest.bind(this));
    // WebSocket upgrades are intentionally declined until a WS transport is wired.
    this.server.on('upgrade', (req, socket, head) => {
      console.log('WebSocket upgrade request received. No handler configured.');
      socket.destroy();
    });
  }

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  }

  public start(): Promise<void> {
    if (this.running) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, () => {
        this.running = true;
        console.log(
          `Gateway server listening on http://${this.config.host}:${this.config.port}`,
        );
        resolve();
      });

      this.server.on('error', (err) => {
        console.error('Gateway server error:', err);
        this.running = false;
        reject(err);
      });
    });
  }

  public stop(): Promise<void> {
    if (!this.running) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.running = false;
        console.log('Gateway server stopped.');
        resolve();
      });
    });
  }

  public isRunning(): boolean {
    return this.running;
  }
}
