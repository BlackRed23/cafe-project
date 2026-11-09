export class MockApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export type Transport = (url: string, init?: RequestInit) => Promise<Response>;
/** Dedicated mock boundary: no fallback, no legacy token, no automatic mutation retry. */
export class MockClient {
  private transport: Transport;
  private token: () => string | null;
  constructor(provider: string | undefined, token: () => string | null, transport: Transport = (url, init) => fetch(url, init)) {
    if (provider !== 'mock') throw new Error('MOCK_CLIENT_DISABLED');
    this.transport = transport; this.token = token;
  }
  async request<T>(path: string, input?: unknown, key?: string, versions: Record<string, string> = {}): Promise<T> {
    if (!/^\/[a-zA-Z0-9/?=:_%-]*$/.test(path.split('?')[0]!) || path.split('?')[0]!.includes('..') || path.startsWith('//') || /[\r\n#]/.test(path)) throw new Error('INVALID_MOCK_PATH');
    const token = this.token(); if (!token) throw new MockApiError(401, 'Sign in with a local mock token.');
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (input !== undefined) {
      if (!key || !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
      headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] = key;
    }
    const response = await this.transport('/api/mock' + path, { method: input === undefined ? 'GET' : 'POST', headers,
      body: input === undefined ? undefined : JSON.stringify(path.startsWith('/agent/') ? { input } : { input, versions }) });
    const body = await response.json();
    if (!response.ok || body.success !== true) throw new MockApiError(response.status, body.message || 'Mock request failed');
    return body.data as T;
  }
}
/** Freeze payload, guards and key across ambiguous responses; caller must inspect before changing operation. */
export class MockCommand {
  readonly key: string; readonly path: string; readonly input: unknown; readonly versions: Record<string, string>;
  constructor(path: string, input: unknown, versions: Record<string, string>, key = crypto.randomUUID()) {
    this.path = path; this.input = structuredClone(input); this.versions = { ...versions }; this.key = key;
  }
  run<T>(client: MockClient): Promise<T> { return client.request<T>(this.path, this.input, this.key, this.versions); }
}
