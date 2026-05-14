process.env.JWT_SECRET = 'test-jwt-secret-key-for-unit-tests';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-unit-tests';
process.env.JWT_KEY = 'test-jwt-key';
process.env.SYSTEM_MASTER_KEY = 'a'.repeat(64);
process.env.REDIS_PASSWORD = 'test';
process.env.MIRRORPORT = '8444';
process.env.MIRRORSTORAGE = '/tmp/test-storage';
