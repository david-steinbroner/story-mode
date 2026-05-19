import { describe, expect, test, afterEach } from 'vitest';
import { resolveModel, setAdminModelOverride, MODEL_ALIASES, DEFAULT_MODEL } from './aiModel';

describe('resolveModel — purpose=puzzle-generation', () => {
  afterEach(() => {
    setAdminModelOverride(null);
    delete process.env.AI_MODEL_OVERRIDE;
    process.env.NODE_ENV = 'test';
  });

  test('always returns haiku alias, regardless of header', () => {
    expect(resolveModel('sonnet', { purpose: 'puzzle-generation' })).toBe(MODEL_ALIASES.haiku);
  });

  test('always returns haiku, regardless of admin override', () => {
    setAdminModelOverride('sonnet');
    expect(resolveModel(undefined, { purpose: 'puzzle-generation' })).toBe(MODEL_ALIASES.haiku);
  });

  test('always returns haiku, regardless of env override', () => {
    process.env.AI_MODEL_OVERRIDE = 'anthropic/claude-sonnet-4';
    expect(resolveModel(undefined, { purpose: 'puzzle-generation' })).toBe(MODEL_ALIASES.haiku);
  });
});

describe('resolveModel — default (no purpose) — unchanged behavior', () => {
  afterEach(() => {
    setAdminModelOverride(null);
    delete process.env.AI_MODEL_OVERRIDE;
    process.env.NODE_ENV = 'test';
  });

  test('falls through to DEFAULT_MODEL with nothing set', () => {
    expect(resolveModel(undefined)).toBe(DEFAULT_MODEL);
  });

  test('respects admin override', () => {
    setAdminModelOverride('sonnet');
    expect(resolveModel(undefined)).toBe(MODEL_ALIASES.sonnet);
  });

  test('respects dev header outside prod', () => {
    process.env.NODE_ENV = 'development';
    expect(resolveModel('sonnet')).toBe(MODEL_ALIASES.sonnet);
  });

  test('ignores dev header in prod', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveModel('sonnet')).toBe(DEFAULT_MODEL);
  });
});
