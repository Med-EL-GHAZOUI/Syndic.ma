import { takeTokenFromFragment } from './reset-password';

describe('takeTokenFromFragment', () => {
  afterEach(() => history.replaceState(null, '', '/'));

  it('returns the token from the URL fragment and scrubs it from the address bar', () => {
    history.replaceState(null, '', '/reset-password#token=abc_DEF-123');
    expect(takeTokenFromFragment()).toBe('abc_DEF-123');
    expect(location.hash).toBe('');
    expect(location.href).not.toContain('abc_DEF-123');
  });

  it('ignores a token passed in the query string (links must use the fragment)', () => {
    history.replaceState(null, '', '/reset-password?token=leaky');
    expect(takeTokenFromFragment()).toBe('');
  });

  it('returns an empty string when there is no fragment', () => {
    history.replaceState(null, '', '/reset-password');
    expect(takeTokenFromFragment()).toBe('');
  });
});
