import type { Config } from 'jest';

const config: Config = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src/__tests__'],
	testMatch: ['**/*.test.ts'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
	collectCoverageFrom: [
		'src/core/**/*.ts',
		'src/api/**/*.ts',
		'src/modules/**/*.ts',
		'!**/*.d.ts',
		'!**/node_modules/**',
	],
	coverageThresholds: {
		global: {
			branches: 30,
			functions: 30,
			lines: 30,
			statements: 30,
		},
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
	},
};

export default config;
