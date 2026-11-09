/** @type {import('jest').Config} */
export default {
  testEnvironment: '<rootDir>/tests/setup/jsdom-env.cjs',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.{ts,tsx}'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  moduleNameMapper: {
    // Vite-only `import.meta.env` lives in env.ts; tests use a stub.
    '^@/lib/env$': '<rootDir>/tests/setup/env-stub.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css)$': 'identity-obj-proxy',
    '\\?url$': '<rootDir>/tests/setup/url-stub.ts',
  },
  setupFiles: ['<rootDir>/tests/setup/env.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/main.tsx', '!src/**/*.d.ts', '!src/lib/env.ts'],
  coverageReporters: ['text-summary', 'text', 'lcov', 'html'],
  coverageThreshold: { global: { statements: 70, branches: 60, functions: 60, lines: 70 } },
};
