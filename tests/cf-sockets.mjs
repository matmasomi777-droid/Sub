// Stub for cloudflare:sockets — delegate to a swappable mock.
export const __mock = { connect: null };
export function connect(addr, opts) {
  if (!__mock.connect) throw new Error('connect() not mocked in this test');
  return __mock.connect(addr, opts);
}
