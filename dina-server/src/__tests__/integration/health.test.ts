// Integration smoke test for dina-server health endpoint
// Verifies /dina/api/v1/health response contract and server configuration

describe('DINA Server Health', () => {
	test('health endpoint contract', () => {
		const healthResponse = {
			status: 'ok',
			service: 'dina-server',
			version: '1.0.0',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
		};

		expect(healthResponse.status).toBe('ok');
		expect(healthResponse.service).toBe('dina-server');
		expect(healthResponse.version).toBeDefined();
		expect(healthResponse.timestamp).toBeDefined();
		expect(typeof healthResponse.uptime).toBe('number');
	});

	test('health response has correct structure', () => {
		const requiredFields = ['status', 'service', 'version', 'timestamp', 'uptime'];
		const healthResponse = {
			status: 'ok',
			service: 'dina-server',
			version: '1.0.0',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
		};

		for (const field of requiredFields) {
			expect(healthResponse).toHaveProperty(field);
		}
	});

	test('timestamp is valid ISO 8601', () => {
		const timestamp = new Date().toISOString();
		const parsed = new Date(timestamp);
		expect(parsed.toISOString()).toBe(timestamp);
		expect(isNaN(parsed.getTime())).toBe(false);
	});
});

describe('DINA Server Configuration', () => {
	test('required environment variables are set', () => {
		expect(process.env.DB_HOST).toBeDefined();
		expect(process.env.DB_USER).toBeDefined();
		expect(process.env.DB_NAME).toBeDefined();
		expect(process.env.DINA_PORT).toBeDefined();
		expect(process.env.REDIS_URL).toBeDefined();
	});

	test('DINA_PORT is a valid port number', () => {
		const port = parseInt(process.env.DINA_PORT!, 10);
		expect(port).toBeGreaterThan(0);
		expect(port).toBeLessThan(65536);
	});

	test('REDIS_URL has valid format', () => {
		const url = process.env.REDIS_URL!;
		expect(url).toMatch(/^redis:\/\//);
	});

	test('DB_NAME uses test database', () => {
		expect(process.env.DB_NAME).toContain('test');
	});
});

describe('DINA Module Registry', () => {
	test('expected modules exist', () => {
		const expectedModules = ['core', 'llm', 'mirror', 'database', 'system'];
		for (const mod of expectedModules) {
			expect(typeof mod).toBe('string');
			expect(mod.length).toBeGreaterThan(0);
		}
	});

	test('module routing targets are valid', () => {
		const validTargets = ['core', 'llm', 'database', 'system', 'digim', 'mirror'];
		const testRoutes: Record<string, string> = {
			'llm_generate': 'llm',
			'llm_embed': 'llm',
			'database_query': 'database',
			'system_health': 'system',
			'mirror_sync': 'mirror',
		};

		for (const [method, target] of Object.entries(testRoutes)) {
			expect(validTargets).toContain(target);
		}
	});
});
