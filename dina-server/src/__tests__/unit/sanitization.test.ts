// Tests for dina-server input sanitization and security boundaries
// Covers: XSS prevention, payload cleaning, trust level enforcement, CORS validation

function sanitizePayload(input: any): any {
	if (typeof input === 'string') {
		return input
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
			.replace(/javascript:/gi, '')
			.replace(/\bon\w+\s*=/gi, '')
			.replace(/data:\s*text\/html/gi, '');
	}
	if (Array.isArray(input)) return input.map(sanitizePayload);
	if (input && typeof input === 'object') {
		const result: any = {};
		for (const [key, value] of Object.entries(input)) {
			result[key] = sanitizePayload(value);
		}
		return result;
	}
	return input;
}

const CORS_WHITELIST = [
	'https://theundergroundrailroad.world',
	'https://www.theundergroundrailroad.world',
	'http://localhost:5173',
	'http://localhost:3000',
];

function isAllowedOrigin(origin: string): boolean {
	return CORS_WHITELIST.includes(origin);
}

type TrustLevel = 'new' | 'trusted' | 'suspicious' | 'blocked';

function getModelAccess(trustLevel: TrustLevel): string[] {
	switch (trustLevel) {
		case 'blocked':
			return ['mxbai-embed-large'];
		case 'suspicious':
			return ['mxbai-embed-large', 'llama3.2'];
		case 'new':
			return ['mxbai-embed-large', 'llama3.2', 'mistral'];
		case 'trusted':
			return ['mxbai-embed-large', 'llama3.2', 'mistral', 'llama3.1', 'codellama'];
		default:
			return ['mxbai-embed-large'];
	}
}

function validateServiceKey(provided: string, expected: string): boolean {
	if (provided.length !== expected.length) return false;
	let mismatch = 0;
	for (let i = 0; i < provided.length; i++) {
		mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
	}
	return mismatch === 0;
}

describe('Payload Sanitization', () => {
	test('removes script tags', () => {
		expect(sanitizePayload('<script>alert("xss")</script>')).toBe('');
		expect(sanitizePayload('before<script>bad</script>after')).toBe('beforeafter');
	});

	test('removes script tags case-insensitively', () => {
		expect(sanitizePayload('<SCRIPT>alert(1)</SCRIPT>')).toBe('');
		expect(sanitizePayload('<ScRiPt>alert(1)</sCrIpT>')).toBe('');
	});

	test('removes javascript: protocol', () => {
		expect(sanitizePayload('javascript:alert(1)')).not.toContain('javascript:');
		expect(sanitizePayload('JAVASCRIPT:void(0)')).not.toMatch(/javascript:/i);
	});

	test('removes inline event handlers', () => {
		expect(sanitizePayload('onerror=steal()')).not.toMatch(/onerror\s*=/i);
		expect(sanitizePayload('onclick=bad()')).not.toMatch(/onclick\s*=/i);
		expect(sanitizePayload('onload=init()')).not.toMatch(/onload\s*=/i);
		expect(sanitizePayload('onmouseover=track()')).not.toMatch(/onmouseover\s*=/i);
	});

	test('removes data:text/html payloads', () => {
		expect(sanitizePayload('data:text/html,<script>bad</script>')).not.toMatch(/data:\s*text\/html/i);
	});

	test('preserves normal text', () => {
		expect(sanitizePayload('Hello, this is a normal message.')).toBe('Hello, this is a normal message.');
		expect(sanitizePayload('User typed 123 and clicked OK')).toBe('User typed 123 and clicked OK');
	});

	test('handles nested objects', () => {
		const input = {
			user: { name: 'test', bio: '<script>steal()</script>Normal bio' },
			messages: ['<script>bad</script>', 'Good message'],
		};
		const result = sanitizePayload(input);
		expect(result.user.bio).not.toContain('<script>');
		expect(result.user.bio).toContain('Normal bio');
		expect(result.messages[0]).not.toContain('<script>');
		expect(result.messages[1]).toBe('Good message');
	});

	test('handles deeply nested structures', () => {
		const input = { a: { b: { c: { d: '<script>deep</script>safe' } } } };
		const result = sanitizePayload(input);
		expect(result.a.b.c.d).toBe('safe');
	});

	test('preserves non-string types', () => {
		expect(sanitizePayload(42)).toBe(42);
		expect(sanitizePayload(true)).toBe(true);
		expect(sanitizePayload(null)).toBeNull();
		expect(sanitizePayload(undefined)).toBeUndefined();
	});

	test('handles empty inputs', () => {
		expect(sanitizePayload('')).toBe('');
		expect(sanitizePayload({})).toEqual({});
		expect(sanitizePayload([])).toEqual([]);
	});

	test('handles mixed array types', () => {
		const input = ['text', 42, '<script>bad</script>', true, { key: 'javascript:void(0)' }];
		const result = sanitizePayload(input);
		expect(result[0]).toBe('text');
		expect(result[1]).toBe(42);
		expect(result[2]).not.toContain('<script>');
		expect(result[3]).toBe(true);
		expect(result[4].key).not.toContain('javascript:');
	});
});

describe('CORS Validation', () => {
	test('allows production origins', () => {
		expect(isAllowedOrigin('https://theundergroundrailroad.world')).toBe(true);
		expect(isAllowedOrigin('https://www.theundergroundrailroad.world')).toBe(true);
	});

	test('allows development origins', () => {
		expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
		expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
	});

	test('rejects unknown origins', () => {
		expect(isAllowedOrigin('https://evil.com')).toBe(false);
		expect(isAllowedOrigin('https://theundergroundrailroad.world.evil.com')).toBe(false);
		expect(isAllowedOrigin('http://localhost:9999')).toBe(false);
	});

	test('rejects empty origin', () => {
		expect(isAllowedOrigin('')).toBe(false);
	});
});

describe('Trust Level - Model Access', () => {
	test('blocked users get only embed model', () => {
		const models = getModelAccess('blocked');
		expect(models).toEqual(['mxbai-embed-large']);
		expect(models).not.toContain('llama3.2');
	});

	test('suspicious users get limited models', () => {
		const models = getModelAccess('suspicious');
		expect(models).toContain('mxbai-embed-large');
		expect(models).toContain('llama3.2');
		expect(models).not.toContain('codellama');
	});

	test('new users get moderate access', () => {
		const models = getModelAccess('new');
		expect(models).toContain('mistral');
		expect(models).not.toContain('codellama');
	});

	test('trusted users get full model access', () => {
		const models = getModelAccess('trusted');
		expect(models).toContain('codellama');
		expect(models).toContain('llama3.1');
		expect(models).toContain('mistral');
		expect(models.length).toBe(5);
	});

	test('trust levels are hierarchical (each level includes previous)', () => {
		const blocked = getModelAccess('blocked');
		const suspicious = getModelAccess('suspicious');
		const newUser = getModelAccess('new');
		const trusted = getModelAccess('trusted');

		expect(blocked.length).toBeLessThan(suspicious.length);
		expect(suspicious.length).toBeLessThan(newUser.length);
		expect(newUser.length).toBeLessThan(trusted.length);

		for (const model of blocked) expect(suspicious).toContain(model);
		for (const model of suspicious) expect(newUser).toContain(model);
		for (const model of newUser) expect(trusted).toContain(model);
	});
});

describe('Service Key Validation (timing-safe)', () => {
	const REAL_KEY = 'super-secret-service-key-12345';

	test('accepts correct key', () => {
		expect(validateServiceKey(REAL_KEY, REAL_KEY)).toBe(true);
	});

	test('rejects wrong key', () => {
		expect(validateServiceKey('wrong-key-totally-different', REAL_KEY)).toBe(false);
	});

	test('rejects key with different length', () => {
		expect(validateServiceKey('short', REAL_KEY)).toBe(false);
		expect(validateServiceKey(REAL_KEY + 'extra', REAL_KEY)).toBe(false);
	});

	test('rejects key with single character difference', () => {
		const almostRight = REAL_KEY.slice(0, -1) + 'X';
		expect(validateServiceKey(almostRight, REAL_KEY)).toBe(false);
	});

	test('rejects empty key', () => {
		expect(validateServiceKey('', REAL_KEY)).toBe(false);
	});
});
