import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  issueAdminSession,
  verifyAdminSession,
  extractBearerToken,
} from './adminAuth';

// Per spec §2: cover round-trip, expired, bad-signature, malformed,
// and missing-secret cases. These tests are pure JWT — no DB, no env
// beyond ADMIN_JWT_SECRET which we set/clear per test.

const TEST_SECRET = 'test-secret-not-for-prod-not-for-prod-32-bytes';
const PRIOR_SECRET = process.env.ADMIN_JWT_SECRET;

describe('verifyAdminSession + issueAdminSession (v1.14.5)', () => {
  beforeEach(() => {
    process.env.ADMIN_JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (PRIOR_SECRET === undefined) {
      delete process.env.ADMIN_JWT_SECRET;
    } else {
      process.env.ADMIN_JWT_SECRET = PRIOR_SECRET;
    }
  });

  test('round-trip: issued token verifies', () => {
    const { token, expiresAt } = issueAdminSession();
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const result = verifyAdminSession(token);
    expect(result.ok).toBe(true);
  });

  test('rejects token signed with a different secret', () => {
    const wrong = jwt.sign({ sub: 'admin' }, 'a-different-secret-32-bytes-long-padding', {
      algorithm: 'HS256',
      expiresIn: 3600,
    });
    const result = verifyAdminSession(wrong);
    expect(result).toEqual({ ok: false, reason: 'invalid-credentials' });
  });

  test('rejects expired token', () => {
    const expired = jwt.sign({ sub: 'admin' }, TEST_SECRET, {
      algorithm: 'HS256',
      expiresIn: -60, // already 60s past expiry
    });
    const result = verifyAdminSession(expired);
    expect(result).toEqual({ ok: false, reason: 'invalid-credentials' });
  });

  test('rejects token with wrong subject', () => {
    const wrongSub = jwt.sign({ sub: 'not-admin' }, TEST_SECRET, {
      algorithm: 'HS256',
      expiresIn: 3600,
    });
    const result = verifyAdminSession(wrongSub);
    expect(result).toEqual({ ok: false, reason: 'invalid-credentials' });
  });

  test('rejects malformed token (random garbage)', () => {
    expect(verifyAdminSession('this.is.not-a-real-jwt')).toEqual({
      ok: false,
      reason: 'invalid-credentials',
    });
    expect(verifyAdminSession('garbage')).toEqual({
      ok: false,
      reason: 'invalid-credentials',
    });
  });

  test('rejects empty/undefined token', () => {
    expect(verifyAdminSession(undefined)).toEqual({
      ok: false,
      reason: 'invalid-credentials',
    });
    expect(verifyAdminSession('')).toEqual({
      ok: false,
      reason: 'invalid-credentials',
    });
  });

  test('returns not-configured when ADMIN_JWT_SECRET missing', () => {
    delete process.env.ADMIN_JWT_SECRET;
    expect(verifyAdminSession('anything')).toEqual({
      ok: false,
      reason: 'not-configured',
    });
    expect(() => issueAdminSession()).toThrow(/ADMIN_JWT_SECRET/);
  });
});

describe('extractBearerToken', () => {
  test('returns the token portion of a well-formed header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  test('is case-insensitive on the scheme', () => {
    expect(extractBearerToken('bearer xyz')).toBe('xyz');
    expect(extractBearerToken('BEARER xyz')).toBe('xyz');
  });

  test('trims whitespace from the token', () => {
    expect(extractBearerToken('Bearer   spaced.token  ')).toBe('spaced.token');
  });

  test('returns undefined for missing / malformed headers', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
    expect(extractBearerToken('')).toBeUndefined();
    expect(extractBearerToken('Basic abc')).toBeUndefined();
    expect(extractBearerToken('justtokennoscheme')).toBeUndefined();
  });
});
