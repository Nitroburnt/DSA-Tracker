import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  // Path to Next.js app — loads next.config.ts and .env files in test environment
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // Match test files under src/ as well as __tests__ at the root
  testMatch: [
    '<rootDir>/src/**/*.test.ts?(x)',
    '<rootDir>/__tests__/**/*.test.ts?(x)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Resolve tsconfig path aliases (@/* -> src/*)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}

// createJestConfig wraps the export so that next/jest can load the async Next.js config
export default createJestConfig(config)
