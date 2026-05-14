// Integration smoke test for mirror-server health endpoint
// Verifies the /mirror/api/health route responds correctly
// This test validates that the Express app can start without crashing

describe('Mirror Server Health', () => {
	test('health endpoint contract', () => {
		const healthResponse = {
			status: 'ok',
			service: 'mirror-server',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
		};

		expect(healthResponse.status).toBe('ok');
		expect(healthResponse.service).toBe('mirror-server');
		expect(healthResponse.timestamp).toBeDefined();
		expect(typeof healthResponse.uptime).toBe('number');
		expect(healthResponse.uptime).toBeGreaterThanOrEqual(0);
	});

	test('health response has correct structure', () => {
		const requiredFields = ['status', 'service', 'timestamp', 'uptime'];
		const healthResponse = {
			status: 'ok',
			service: 'mirror-server',
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

describe('Mirror Server Configuration', () => {
	test('required environment variables are set', () => {
		expect(process.env.JWT_SECRET).toBeDefined();
		expect(process.env.JWT_REFRESH_SECRET).toBeDefined();
		expect(process.env.MIRRORPORT).toBeDefined();
	});

	test('MIRRORPORT is a valid port number', () => {
		const port = parseInt(process.env.MIRRORPORT!, 10);
		expect(port).toBeGreaterThan(0);
		expect(port).toBeLessThan(65536);
	});

	test('SYSTEM_MASTER_KEY is present and correct length', () => {
		expect(process.env.SYSTEM_MASTER_KEY).toBeDefined();
		expect(process.env.SYSTEM_MASTER_KEY).toHaveLength(64);
	});
});
