// Tests for DUMP Protocol (Dina Universal Message Protocol)
// Validates message creation, validation, sanitization, and queue routing

enum SecurityLevel {
	PUBLIC = 'PUBLIC',
	RESTRICTED = 'RESTRICTED',
	CONFIDENTIAL = 'CONFIDENTIAL',
	SECRET = 'SECRET',
	TOP_SECRET = 'TOP_SECRET',
}

interface DinaUniversalMessage {
	id: string;
	timestamp: number;
	version: string;
	source: { module: string; version: string };
	target: { module: string; method: string; priority: number };
	security: { level: SecurityLevel; sanitized: boolean };
	payload: { data: any };
	qos: { timeout: number; retries: number; delivery: string };
	trace: { requestId: string; depth: number };
	method: string;
}

function createDinaMessage(overrides: Partial<DinaUniversalMessage> = {}): DinaUniversalMessage {
	return {
		id: overrides.id ?? 'msg-' + Math.random().toString(36).substring(2, 10),
		timestamp: overrides.timestamp ?? Date.now(),
		version: overrides.version ?? '1.0.0',
		source: overrides.source ?? { module: 'test', version: '1.0.0' },
		target: overrides.target ?? { module: 'core', method: 'process', priority: 5 },
		security: overrides.security ?? { level: SecurityLevel.PUBLIC, sanitized: false },
		payload: overrides.payload ?? { data: {} },
		qos: overrides.qos ?? { timeout: 30000, retries: 3, delivery: 'at-least-once' },
		trace: overrides.trace ?? { requestId: 'req-' + Math.random().toString(36).substring(2, 10), depth: 0 },
		method: overrides.method ?? 'process',
	};
}

function validateMessage(msg: any): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	const requiredFields = ['id', 'timestamp', 'version', 'source', 'target', 'security', 'payload', 'qos', 'trace', 'method'];
	for (const field of requiredFields) {
		if (msg[field] === undefined || msg[field] === null) {
			errors.push(`Missing required field: ${field}`);
		}
	}

	if (msg.source && (!msg.source.module || !msg.source.version)) {
		errors.push('source must have module and version');
	}

	if (msg.target) {
		if (!msg.target.module) errors.push('target.module is required');
		if (!msg.target.method) errors.push('target.method is required');
		if (msg.target.priority !== undefined) {
			if (msg.target.priority < 1 || msg.target.priority > 10) {
				errors.push('target.priority must be between 1 and 10');
			}
		}
	}

	if (msg.security && msg.security.level) {
		if (!Object.values(SecurityLevel).includes(msg.security.level)) {
			errors.push('Invalid security level');
		}
	}

	if (msg.payload && msg.payload.data === undefined) {
		errors.push('payload.data is required');
	}

	if (msg.qos && msg.qos.delivery) {
		const validModes = ['at-most-once', 'at-least-once', 'exactly-once'];
		if (!validModes.includes(msg.qos.delivery)) {
			errors.push('Invalid delivery mode');
		}
	}

	if (msg.method === 'llm_generate' && msg.payload?.data) {
		if (!msg.payload.data.query) {
			errors.push('llm_generate requires payload.data.query');
		}
	}

	if (msg.method === 'llm_embed' && msg.payload?.data) {
		if (!msg.payload.data.text) {
			errors.push('llm_embed requires payload.data.text');
		}
	}

	return { valid: errors.length === 0, errors };
}

function sanitizeMessage(msg: DinaUniversalMessage): DinaUniversalMessage {
	const sanitized = JSON.parse(JSON.stringify(msg));

	function sanitizeValue(val: any): any {
		if (typeof val === 'string') {
			return val
				.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
				.replace(/javascript:/gi, '')
				.replace(/\bon\w+\s*=/gi, '');
		}
		if (Array.isArray(val)) return val.map(sanitizeValue);
		if (val && typeof val === 'object') {
			const result: any = {};
			for (const [k, v] of Object.entries(val)) {
				result[k] = sanitizeValue(v);
			}
			return result;
		}
		return val;
	}

	sanitized.payload = sanitizeValue(sanitized.payload);
	sanitized.security.sanitized = true;
	return sanitized;
}

function getQueueName(priority: number, systemLoad: number = 0.5): string {
	if (priority >= 8 || systemLoad < 0.3) return 'dina:queue:priority:high';
	if (priority >= 5 || systemLoad < 0.7) return 'dina:queue:priority:medium';
	if (priority >= 3) return 'dina:queue:priority:low';
	return 'dina:queue:priority:batch';
}

function calculateMessagePriority(method: string, payload: any): number {
	if (method === 'system_health' || method === 'system_status') return 10;
	if (method === 'llm_generate') return 7;
	if (method === 'llm_embed') return 5;
	if (method === 'database_query') return 4;
	return 3;
}

describe('DUMP Protocol - Message Creation', () => {
	test('creates a valid message with defaults', () => {
		const msg = createDinaMessage();
		expect(msg.id).toBeDefined();
		expect(msg.timestamp).toBeGreaterThan(0);
		expect(msg.version).toBe('1.0.0');
		expect(msg.source.module).toBe('test');
		expect(msg.target.module).toBe('core');
		expect(msg.method).toBe('process');
	});

	test('creates a message with overrides', () => {
		const msg = createDinaMessage({
			method: 'llm_generate',
			target: { module: 'llm', method: 'generate', priority: 8 },
			payload: { data: { query: 'Hello world' } },
		});
		expect(msg.method).toBe('llm_generate');
		expect(msg.target.module).toBe('llm');
		expect(msg.target.priority).toBe(8);
		expect(msg.payload.data.query).toBe('Hello world');
	});

	test('generates unique message IDs', () => {
		const ids = new Set(Array.from({ length: 100 }, () => createDinaMessage().id));
		expect(ids.size).toBe(100);
	});

	test('timestamp is current time', () => {
		const before = Date.now();
		const msg = createDinaMessage();
		const after = Date.now();
		expect(msg.timestamp).toBeGreaterThanOrEqual(before);
		expect(msg.timestamp).toBeLessThanOrEqual(after);
	});
});

describe('DUMP Protocol - Message Validation', () => {
	test('accepts a valid message', () => {
		const msg = createDinaMessage();
		const result = validateMessage(msg);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test('rejects message with missing required fields', () => {
		const result = validateMessage({});
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('rejects missing id', () => {
		const msg = createDinaMessage();
		delete (msg as any).id;
		const result = validateMessage(msg);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain('Missing required field: id');
	});

	test('rejects missing method', () => {
		const msg = createDinaMessage();
		delete (msg as any).method;
		const result = validateMessage(msg);
		expect(result.valid).toBe(false);
	});

	test('rejects priority outside 1-10 range', () => {
		const msg = createDinaMessage({ target: { module: 'core', method: 'test', priority: 15 } });
		const result = validateMessage(msg);
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('priority'))).toBe(true);
	});

	test('rejects priority of 0', () => {
		const msg = createDinaMessage({ target: { module: 'core', method: 'test', priority: 0 } });
		const result = validateMessage(msg);
		expect(result.valid).toBe(false);
	});

	test('accepts priority at boundaries (1 and 10)', () => {
		const low = createDinaMessage({ target: { module: 'core', method: 'test', priority: 1 } });
		const high = createDinaMessage({ target: { module: 'core', method: 'test', priority: 10 } });
		expect(validateMessage(low).valid).toBe(true);
		expect(validateMessage(high).valid).toBe(true);
	});

	test('rejects invalid security level', () => {
		const msg = createDinaMessage();
		(msg.security as any).level = 'ULTRA_SECRET';
		const result = validateMessage(msg);
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('security level'))).toBe(true);
	});

	test('accepts all valid security levels', () => {
		for (const level of Object.values(SecurityLevel)) {
			const msg = createDinaMessage();
			msg.security.level = level;
			expect(validateMessage(msg).valid).toBe(true);
		}
	});

	test('rejects invalid delivery mode', () => {
		const msg = createDinaMessage();
		msg.qos.delivery = 'fire-and-forget';
		const result = validateMessage(msg);
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('delivery mode'))).toBe(true);
	});

	test('accepts all valid delivery modes', () => {
		for (const mode of ['at-most-once', 'at-least-once', 'exactly-once']) {
			const msg = createDinaMessage();
			msg.qos.delivery = mode;
			expect(validateMessage(msg).valid).toBe(true);
		}
	});

	test('rejects source without module', () => {
		const msg = createDinaMessage();
		(msg.source as any).module = '';
		const result = validateMessage(msg);
		expect(result.valid).toBe(false);
	});

	test('rejects source without version', () => {
		const msg = createDinaMessage();
		(msg.source as any).version = '';
		const result = validateMessage(msg);
		expect(result.valid).toBe(false);
	});

	test('requires query for llm_generate method', () => {
		const msg = createDinaMessage({ method: 'llm_generate', payload: { data: {} } });
		const result = validateMessage(msg);
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('llm_generate'))).toBe(true);
	});

	test('accepts llm_generate with query', () => {
		const msg = createDinaMessage({
			method: 'llm_generate',
			payload: { data: { query: 'What is AI?' } },
		});
		expect(validateMessage(msg).valid).toBe(true);
	});

	test('requires text for llm_embed method', () => {
		const msg = createDinaMessage({ method: 'llm_embed', payload: { data: {} } });
		const result = validateMessage(msg);
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('llm_embed'))).toBe(true);
	});

	test('accepts llm_embed with text', () => {
		const msg = createDinaMessage({
			method: 'llm_embed',
			payload: { data: { text: 'Embed this sentence' } },
		});
		expect(validateMessage(msg).valid).toBe(true);
	});

	test('rejects missing payload.data', () => {
		const msg = createDinaMessage();
		(msg.payload as any).data = undefined;
		const result = validateMessage(msg);
		expect(result.valid).toBe(false);
	});
});

describe('DUMP Protocol - Message Sanitization', () => {
	test('removes script tags from payload', () => {
		const msg = createDinaMessage({
			payload: { data: { html: '<script>alert("xss")</script>Hello' } },
		});
		const sanitized = sanitizeMessage(msg);
		expect(sanitized.payload.data.html).not.toContain('<script>');
		expect(sanitized.payload.data.html).toContain('Hello');
	});

	test('removes javascript: URLs', () => {
		const msg = createDinaMessage({
			payload: { data: { url: 'javascript:alert(1)' } },
		});
		const sanitized = sanitizeMessage(msg);
		expect(sanitized.payload.data.url).not.toContain('javascript:');
	});

	test('removes event handlers', () => {
		const msg = createDinaMessage({
			payload: { data: { html: '<img onerror="steal()" src="x">' } },
		});
		const sanitized = sanitizeMessage(msg);
		expect(sanitized.payload.data.html).not.toMatch(/onerror\s*=/i);
	});

	test('marks message as sanitized', () => {
		const msg = createDinaMessage();
		expect(msg.security.sanitized).toBe(false);
		const sanitized = sanitizeMessage(msg);
		expect(sanitized.security.sanitized).toBe(true);
	});

	test('does not mutate original message', () => {
		const msg = createDinaMessage({
			payload: { data: { html: '<script>bad</script>' } },
		});
		const original = JSON.parse(JSON.stringify(msg));
		sanitizeMessage(msg);
		expect(msg).toEqual(original);
	});

	test('recursively sanitizes nested objects', () => {
		const msg = createDinaMessage({
			payload: {
				data: {
					level1: {
						level2: {
							text: '<script>deep</script>clean',
						},
					},
				},
			},
		});
		const sanitized = sanitizeMessage(msg);
		expect(sanitized.payload.data.level1.level2.text).not.toContain('<script>');
		expect(sanitized.payload.data.level1.level2.text).toContain('clean');
	});

	test('sanitizes arrays in payload', () => {
		const msg = createDinaMessage({
			payload: {
				data: {
					items: ['<script>alert(1)</script>', 'safe text', 'javascript:void(0)'],
				},
			},
		});
		const sanitized = sanitizeMessage(msg);
		expect(sanitized.payload.data.items[0]).not.toContain('<script>');
		expect(sanitized.payload.data.items[1]).toBe('safe text');
		expect(sanitized.payload.data.items[2]).not.toContain('javascript:');
	});

	test('preserves non-string values', () => {
		const msg = createDinaMessage({
			payload: { data: { count: 42, flag: true, empty: null } },
		});
		const sanitized = sanitizeMessage(msg);
		expect(sanitized.payload.data.count).toBe(42);
		expect(sanitized.payload.data.flag).toBe(true);
		expect(sanitized.payload.data.empty).toBeNull();
	});
});

describe('DUMP Protocol - Queue Routing', () => {
	test('high priority (>=8) routes to high queue', () => {
		expect(getQueueName(8)).toBe('dina:queue:priority:high');
		expect(getQueueName(9)).toBe('dina:queue:priority:high');
		expect(getQueueName(10)).toBe('dina:queue:priority:high');
	});

	test('low system load routes to high queue', () => {
		expect(getQueueName(3, 0.2)).toBe('dina:queue:priority:high');
	});

	test('medium priority (5-7) routes to medium queue', () => {
		expect(getQueueName(5)).toBe('dina:queue:priority:medium');
		expect(getQueueName(6)).toBe('dina:queue:priority:medium');
		expect(getQueueName(7)).toBe('dina:queue:priority:medium');
	});

	test('low priority (3-4) routes to low queue', () => {
		expect(getQueueName(3, 0.8)).toBe('dina:queue:priority:low');
		expect(getQueueName(4, 0.8)).toBe('dina:queue:priority:low');
	});

	test('very low priority (<3) routes to batch queue', () => {
		expect(getQueueName(1, 0.8)).toBe('dina:queue:priority:batch');
		expect(getQueueName(2, 0.8)).toBe('dina:queue:priority:batch');
	});

	test('system load affects routing', () => {
		// Same priority, different load
		expect(getQueueName(4, 0.2)).toBe('dina:queue:priority:high');
		expect(getQueueName(4, 0.5)).toBe('dina:queue:priority:medium');
		expect(getQueueName(4, 0.8)).toBe('dina:queue:priority:low');
	});
});

describe('DUMP Protocol - Priority Calculation', () => {
	test('system methods get highest priority', () => {
		expect(calculateMessagePriority('system_health', {})).toBe(10);
		expect(calculateMessagePriority('system_status', {})).toBe(10);
	});

	test('LLM generate gets high priority', () => {
		expect(calculateMessagePriority('llm_generate', {})).toBe(7);
	});

	test('LLM embed gets medium priority', () => {
		expect(calculateMessagePriority('llm_embed', {})).toBe(5);
	});

	test('database queries get lower priority', () => {
		expect(calculateMessagePriority('database_query', {})).toBe(4);
	});

	test('unknown methods get default priority', () => {
		expect(calculateMessagePriority('custom_method', {})).toBe(3);
	});

	test('priority values are in valid range', () => {
		const methods = ['system_health', 'llm_generate', 'llm_embed', 'database_query', 'unknown'];
		for (const method of methods) {
			const priority = calculateMessagePriority(method, {});
			expect(priority).toBeGreaterThanOrEqual(1);
			expect(priority).toBeLessThanOrEqual(10);
		}
	});
});
