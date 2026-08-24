import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('ayse@otel.test')).toBe('a***@otel.test');
  });

  it('masks a single-character local part', () => {
    expect(maskEmail('a@otel.test')).toBe('a***@otel.test');
  });

  it('splits on the last @, so the domain is never guessable from the local part', () => {
    expect(maskEmail('weird@name@otel.test')).toBe('w***@otel.test');
  });

  it('reveals nothing when the value is not an address', () => {
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('@otel.test')).toBe('***');
    expect(maskEmail('')).toBe('***');
  });
});
