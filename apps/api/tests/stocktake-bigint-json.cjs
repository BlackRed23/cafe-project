// Test-only serialization compatibility for legacy NL/LO/BH scripts that
// stringify raw Prisma records. Never imported by production application code.
if (typeof BigInt.prototype.toJSON !== 'function') {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value() { return this.toString(); },
    configurable: true,
    writable: true
  });
}
