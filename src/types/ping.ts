import TcpSocket from 'react-native-tcp-socket';

export type PingEntry = {
  ms: number | null;
  updatedAt: number;
  error?: string;
  networkType?: string;
  connectionQuality?: string;
  estimatedSpeed?: number;
};

export type PingResult = {
  ms: number | null;
  error?: string;
};

export const httpPing = async (
  url: string,
  timeoutMs = 1500,
): Promise<PingResult> => {
  const start = Date.now();
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => {
    controller?.abort();
  }, timeoutMs);

  try {
    const cacheBust = url.includes('?') ? '&_t=' : '?_t=';
    await fetch(`${url}${cacheBust}${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller?.signal,
    });
    clearTimeout(timer);
    return {ms: Date.now() - start};
  } catch (err: any) {
    clearTimeout(timer);
    return {ms: null, error: err?.message ?? 'http ping failed'};
  }
};

export const tcpPing = (
  host: string,
  port: number,
  timeoutMs = 2000,
): Promise<PingResult> => {
  return new Promise(resolve => {
    let settled = false;
    let socket: any = null;
    const start = Date.now();

    const finish = (result: PingResult) => {
      if (!settled) {
        settled = true;
        try {
          if (socket) {
            socket.destroy();
            socket.removeAllListeners();
          }
        } catch {}
        resolve(result);
      }
    };

    try {
      socket = TcpSocket.createConnection(
        {
          host,
          port,
        },
        () => {
          if (!settled) {
            const elapsed = Date.now() - start;
            if (elapsed <= 5000) {
              finish({ms: elapsed});
            } else {
              finish({ms: null, error: 'timeout'});
            }
          }
        },
      );

      const timeoutId = setTimeout(() => {
        finish({ms: null, error: 'timeout'});
      }, timeoutMs);

      try {
        socket.setTimeout?.(timeoutMs);
      } catch {}

      socket.on('error', (err: any) => {
        clearTimeout(timeoutId);
        const errMsg = err?.message ?? err?.code ?? 'connection error';
        finish({ms: null, error: errMsg});
      });

      socket.on('close', () => {
        clearTimeout(timeoutId);
      });

      socket.on('end', () => {
        clearTimeout(timeoutId);
      });

      socket.on('timeout', () => {
        clearTimeout(timeoutId);
        finish({ms: null, error: 'socket timeout'});
      });
    } catch (err: any) {
      const errMsg = err?.message ?? 'connection failed';
      finish({ms: null, error: errMsg});
    }
  });
};
