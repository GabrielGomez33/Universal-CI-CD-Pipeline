import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

// Inline the token logic to avoid importing DB-dependent modules
function createAccessToken(payload: { id: number; email: string; username: string; sessionId: string }): string {
	return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
}

function createRefreshToken(payload: { id: number; sessionId: string }): string {
	return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
}

function verifyAccessToken(token: string) {
	return jwt.verify(token, JWT_SECRET) as { id: number; email: string; username: string; sessionId: string };
}

function verifyRefreshToken(token: string) {
	return jwt.verify(token, JWT_REFRESH_SECRET) as { id: number; sessionId: string };
}

describe('Token Management', () => {
	const testUser = { id: 1, email: 'test@example.com', username: 'testuser', sessionId: 'sess-abc123' };

	describe('Access Tokens', () => {
		test('creates a valid access token', () => {
			const token = createAccessToken(testUser);
			expect(token).toBeDefined();
			expect(typeof token).toBe('string');
			expect(token.split('.')).toHaveLength(3);
		});

		test('access token contains correct payload', () => {
			const token = createAccessToken(testUser);
			const decoded = verifyAccessToken(token);
			expect(decoded.id).toBe(testUser.id);
			expect(decoded.email).toBe(testUser.email);
			expect(decoded.username).toBe(testUser.username);
			expect(decoded.sessionId).toBe(testUser.sessionId);
		});

		test('access token has 15m expiry', () => {
			const token = createAccessToken(testUser);
			const decoded = jwt.decode(token) as any;
			const expiryDuration = decoded.exp - decoded.iat;
			expect(expiryDuration).toBe(15 * 60);
		});

		test('rejects token signed with wrong secret', () => {
			const fakeToken = jwt.sign(testUser, 'wrong-secret', { expiresIn: '15m' });
			expect(() => verifyAccessToken(fakeToken)).toThrow();
		});

		test('rejects expired access token', () => {
			const expiredToken = jwt.sign(testUser, JWT_SECRET, { expiresIn: '0s' });
			expect(() => verifyAccessToken(expiredToken)).toThrow('expired');
		});

		test('rejects malformed token', () => {
			expect(() => verifyAccessToken('not.a.valid.token')).toThrow();
			expect(() => verifyAccessToken('')).toThrow();
			expect(() => verifyAccessToken('abc')).toThrow();
		});
	});

	describe('Refresh Tokens', () => {
		test('creates a valid refresh token', () => {
			const token = createRefreshToken({ id: testUser.id, sessionId: testUser.sessionId });
			expect(token).toBeDefined();
			expect(token.split('.')).toHaveLength(3);
		});

		test('refresh token contains correct payload', () => {
			const token = createRefreshToken({ id: testUser.id, sessionId: testUser.sessionId });
			const decoded = verifyRefreshToken(token);
			expect(decoded.id).toBe(testUser.id);
			expect(decoded.sessionId).toBe(testUser.sessionId);
		});

		test('refresh token has 7d expiry', () => {
			const token = createRefreshToken({ id: testUser.id, sessionId: testUser.sessionId });
			const decoded = jwt.decode(token) as any;
			const expiryDuration = decoded.exp - decoded.iat;
			expect(expiryDuration).toBe(7 * 24 * 60 * 60);
		});

		test('access and refresh tokens use different secrets', () => {
			const accessToken = createAccessToken(testUser);
			const refreshToken = createRefreshToken({ id: testUser.id, sessionId: testUser.sessionId });

			// Access token should fail verification with refresh secret
			expect(() => jwt.verify(accessToken, JWT_REFRESH_SECRET)).toThrow();
			// Refresh token should fail verification with access secret
			expect(() => jwt.verify(refreshToken, JWT_SECRET)).toThrow();
		});
	});

	describe('Session ID Generation', () => {
		test('generates unique session IDs', () => {
			const crypto = require('crypto');
			const ids = new Set(Array.from({ length: 100 }, () => crypto.randomBytes(32).toString('hex')));
			expect(ids.size).toBe(100);
		});

		test('session ID is 64 hex characters', () => {
			const crypto = require('crypto');
			const id = crypto.randomBytes(32).toString('hex');
			expect(id).toHaveLength(64);
			expect(id).toMatch(/^[0-9a-f]+$/);
		});
	});
});
