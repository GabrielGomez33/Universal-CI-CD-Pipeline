// Tests for validation and sanitization functions used across mirror-server

// Inline validators (from utils/validators.ts)
const validateGroupId = (id: string) => /^grp-[a-zA-Z0-9-]+$/.test(id);
const validateUserId = (id: string) => /^(user-)?[a-zA-Z0-9-]+$/.test(id);

// Inline sanitizeHtml (from controllers/chatController.ts)
function sanitizeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;')
		.replace(/\//g, '&#x2F;');
}

function sanitizeForLog(input: string, maxLength: number = 100): string {
	return sanitizeHtml(input).substring(0, maxLength);
}

// UUID validation
function isValidUUID(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

describe('Input Validation', () => {
	describe('validateGroupId', () => {
		test('accepts valid group IDs', () => {
			expect(validateGroupId('grp-abc123')).toBe(true);
			expect(validateGroupId('grp-a1b2c3-d4e5')).toBe(true);
			expect(validateGroupId('grp-ABC')).toBe(true);
		});

		test('rejects invalid group IDs', () => {
			expect(validateGroupId('')).toBe(false);
			expect(validateGroupId('abc123')).toBe(false);
			expect(validateGroupId('grp-')).toBe(false);
			expect(validateGroupId('grp-abc!@#')).toBe(false);
			expect(validateGroupId('GRP-abc123')).toBe(false);
		});

		test('rejects SQL injection attempts', () => {
			expect(validateGroupId("grp-abc'; DROP TABLE--")).toBe(false);
			expect(validateGroupId('grp-abc OR 1=1')).toBe(false);
		});
	});

	describe('validateUserId', () => {
		test('accepts valid user IDs', () => {
			expect(validateUserId('user-abc123')).toBe(true);
			expect(validateUserId('abc123')).toBe(true);
			expect(validateUserId('user-a1b2-c3d4')).toBe(true);
		});

		test('rejects invalid user IDs', () => {
			expect(validateUserId('')).toBe(false);
			expect(validateUserId('user-abc!@#')).toBe(false);
			expect(validateUserId('user-abc def')).toBe(false);
		});
	});

	describe('UUID validation', () => {
		test('accepts valid UUIDs', () => {
			expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
			expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
		});

		test('rejects invalid UUIDs', () => {
			expect(isValidUUID('')).toBe(false);
			expect(isValidUUID('not-a-uuid')).toBe(false);
			expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
			expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
		});
	});
});

describe('HTML Sanitization', () => {
	test('escapes basic HTML characters', () => {
		expect(sanitizeHtml('<script>alert("xss")</script>')).not.toContain('<script>');
		expect(sanitizeHtml('<img onerror="alert(1)">')).not.toContain('<img');
	});

	test('escapes all dangerous characters', () => {
		const result = sanitizeHtml('<div onclick="steal()">text</div>');
		expect(result).not.toContain('<');
		expect(result).not.toContain('>');
		expect(result).toContain('text');
	});

	test('preserves normal text', () => {
		expect(sanitizeHtml('Hello, World!')).toBe('Hello, World!');
		expect(sanitizeHtml('This is a test message.')).toBe('This is a test message.');
	});

	test('handles empty and whitespace input', () => {
		expect(sanitizeHtml('')).toBe('');
		expect(sanitizeHtml('   ')).toBe('   ');
	});

	test('escapes ampersands', () => {
		expect(sanitizeHtml('a & b')).toBe('a &amp; b');
	});

	test('escapes quotes', () => {
		expect(sanitizeHtml('"hello"')).toBe('&quot;hello&quot;');
		expect(sanitizeHtml("'hello'")).toBe('&#x27;hello&#x27;');
	});

	test('handles nested injection attempts', () => {
		const nested = '<scr<script>ipt>alert(1)</scr</script>ipt>';
		const result = sanitizeHtml(nested);
		expect(result).not.toContain('<script>');
	});
});

describe('Log Sanitization', () => {
	test('truncates long input', () => {
		const longInput = 'a'.repeat(500);
		expect(sanitizeForLog(longInput)).toHaveLength(100);
	});

	test('sanitizes HTML in logs', () => {
		expect(sanitizeForLog('<script>alert(1)</script>')).not.toContain('<script>');
	});

	test('respects custom max length', () => {
		const input = 'a'.repeat(50);
		expect(sanitizeForLog(input, 20)).toHaveLength(20);
	});
});

describe('Group Name Validation', () => {
	function validateGroupName(name: string): { valid: boolean; error?: string } {
		if (!name || typeof name !== 'string') return { valid: false, error: 'Group name is required' };
		const trimmed = name.trim();
		if (trimmed.length < 3) return { valid: false, error: 'Group name must be at least 3 characters' };
		if (trimmed.length > 50) return { valid: false, error: 'Group name must be at most 50 characters' };
		return { valid: true };
	}

	test('accepts valid group names', () => {
		expect(validateGroupName('My Group').valid).toBe(true);
		expect(validateGroupName('abc').valid).toBe(true);
		expect(validateGroupName('A'.repeat(50)).valid).toBe(true);
	});

	test('rejects too-short names', () => {
		expect(validateGroupName('ab').valid).toBe(false);
		expect(validateGroupName('').valid).toBe(false);
	});

	test('rejects too-long names', () => {
		expect(validateGroupName('A'.repeat(51)).valid).toBe(false);
	});

	test('trims whitespace before validation', () => {
		expect(validateGroupName('   abc   ').valid).toBe(true);
	});
});

describe('Environment Variable Validation', () => {
	test('SYSTEM_MASTER_KEY must be 64 hex chars', () => {
		const key = process.env.SYSTEM_MASTER_KEY!;
		expect(key).toHaveLength(64);
		expect(key).toMatch(/^[0-9a-fA-F]+$/);
	});
});
