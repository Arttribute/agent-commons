import { request } from 'node:http';
import { connect } from 'node:net';
import { fetchPublicJson, PublicWebEgressProxy, resolvePublicAddress, validatePublicWebUrl } from './public-web-egress';

describe('public Web capture egress', () => {
  it('rejects private, metadata, credentialed, and non-web URLs', () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.2/',
      'http://[::1]/',
      'http://user:password@example.com/',
      'http://example.com:8080/',
      'file:///etc/passwd',
    ]) expect(() => validatePublicWebUrl(url)).toThrow();
    expect(validatePublicWebUrl('https://example.com/page').host).toBe('example.com');
  });

  it('pins a public address and rejects mixed or private DNS', async () => {
    expect(await resolvePublicAddress('example.com', async () => [
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '1.1.1.1', family: 4 },
    ])).toEqual({ address: '1.1.1.1', family: 4 });
    expect(await resolvePublicAddress('example.com', async () => [
      { address: '2606:4700:4700::1111', family: 6 },
    ])).toEqual({ address: '2606:4700:4700::1111', family: 6 });
    await expect(resolvePublicAddress('example.com', async () => [
      { address: '1.1.1.1', family: 4 },
      { address: '192.168.1.5', family: 4 },
    ])).rejects.toThrow('private network');
    await expect(resolvePublicAddress('example.com', async () => [
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '::1', family: 6 },
    ])).rejects.toThrow('private network');
    await expect(resolvePublicAddress('169.254.169.254')).rejects.toThrow('private network');
    await expect(fetchPublicJson('http://127.0.0.1/data')).rejects.toThrow('private network');
  });

  it('rejects direct HTTP and CONNECT attempts to loopback', async () => {
    const proxy = new PublicWebEgressProxy();
    const port = await proxy.listen();
    try {
      const httpStatus = await new Promise<number>((resolve, reject) => {
        const client = request({ host: '127.0.0.1', port, method: 'GET', path: 'http://127.0.0.1/data' }, (response) => {
          response.resume();
          resolve(response.statusCode || 0);
        });
        client.on('error', reject);
        client.end();
      });
      expect(httpStatus).toBe(403);

      const connectStatus = await new Promise<number>((resolve, reject) => {
        const client = request({ host: '127.0.0.1', port, method: 'CONNECT', path: '127.0.0.1:443' });
        client.on('connect', (response, socket) => { socket.destroy(); resolve(response.statusCode || 0); });
        client.on('error', reject);
        client.end();
      });
      expect(connectStatus).toBe(403);

      const upgradeStatus = await new Promise<string>((resolve, reject) => {
        const socket = connect(port, '127.0.0.1', () => {
          socket.write('GET ws://127.0.0.1/chat HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
        });
        socket.once('data', (chunk) => { resolve(chunk.toString('utf8').split('\r\n')[0]); socket.destroy(); });
        socket.once('error', reject);
      });
      expect(upgradeStatus).toBe('HTTP/1.1 403 Forbidden');
    } finally {
      await proxy.close();
    }
  });
});
