import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    '^@govtech-bb/(.*)$': '<rootDir>/../../packages/$1/src/index.ts',
  },
};

export default config;
