const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

test('admin preview and approval import only validated showtimes', async () => {
    const originalCreatePool = mysql.createPool;
    const originalFetch = global.fetch;
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousModel = process.env.ANTHROPIC_MODEL;
    const salt = '0123456789abcdef';
    const password = `${salt}:${crypto.scryptSync('password', salt, 14).toString('hex')}`;
    const stored = [];
    let transaction = [];
    let inTransaction = false;
    let formatAvailable = true;
    let failInsert = false;
    const connection = {
        release() {},
        destroy() {},
        async beginTransaction() { transaction = []; inTransaction = true; },
        async commit() { stored.push(...transaction); transaction = []; inTransaction = false; },
        async rollback() { transaction = []; inTransaction = false; },
        async query(sql) {
            if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
            if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
            if (sql.includes('MAX(showing_id)')) return [[{ max_id: stored.length, next_id: stored.length + 1 }]];
            throw new Error(`Unexpected query: ${sql}`);
        },
        async execute(sql, params) {
            if (sql.includes('MAX(showing_id)')) return [[{ next_id: stored.length + 1 }]];
            if (sql.includes('FROM users')) {
                const admin = params[0] === 'admin@example.test';
                return [[{ users_id: admin ? 1 : 2, first_name: 'Test', last_name: 'User',
                    email_address: params[0], password, admin_permission: admin, employee_permission: false,
                    theater_name: null, theater_id: null }]];
            }
            if (sql.includes('FROM movies')) return [params[0] === 'Movie' || params[0] === 1 ? [{ movie_id: 1 }] : []];
            if (sql.includes('FROM theaters')) return [params[0] === 'Main' ? [{ theater_id: 2 }] : []];
            if (sql.includes('FROM formats')) return [formatAvailable && (params[1] === '2D' || params[0] === 3) ? [{ format_id: 3 }] : []];
            if (sql.includes('FROM showing')) return [stored.filter((row) =>
                row.movieId === params[0] && row.theaterId === params[1] &&
                row.formatId === params[2] && row.showtime === params[3])];
            if (sql.includes('INSERT INTO showing')) {
                if (failInsert && transaction.length === 1) throw new Error('Simulated database error');
                const row = { movieId: params[1], showtime: params[2], theaterId: params[3], formatId: params[4] };
                (inTransaction ? transaction : stored).push(row);
                return [{ affectedRows: 1 }];
            }
            throw new Error(`Unexpected execute: ${sql}`);
        },
    };
    mysql.createPool = () => ({
        getConnection: async () => connection,
        execute: async (_sql, params) => [[{ admin_permission: params[0] === 1 }]],
    });
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.ANTHROPIC_MODEL = 'test-model';
    global.fetch = async (url, options) => {
        if (url === 'https://api.anthropic.com/v1/messages') {
            return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'map_showtime_columns',
                input: { movie: 0, datetime: 1, theater: 2, format: 3 } }] }) };
        }
        return originalFetch(url, options);
    };
    const { app } = require('../src/index.ts');
    const server = await new Promise((resolve) => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async (path, body, token) => {
        const response = await originalFetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(body),
        });
        return { status: response.status, data: await response.json() };
    };
    try {
        const admin = await post('/api/login', { email: 'admin@example.test', password: 'password' });
        const user = await post('/api/login', { email: 'user@example.test', password: 'password' });
        const otherAdmin = await post('/api/login', { email: 'admin@example.test', password: 'password' });
        assert.equal(admin.status, 200);
        assert.equal(user.status, 200);
        const csv = 'movie,datetime,theater,format\nMovie,2026-12-01 19:30,Main,2D\nUnknown,2026-12-01 20:00,Main,2D';
        assert.equal((await post('/api/showings/import/preview', { csv })).status, 401);
        assert.equal((await post('/api/showings/import/preview', { csv }, user.data.token)).status, 403);
        const preview = await post('/api/showings/import/preview', { csv }, admin.data.token);
        assert.equal(preview.status, 200);
        assert.equal(preview.data.valid.length, 1);
        assert.equal(preview.data.invalid.length, 1);
        assert.equal(stored.length, 0);
        assert.equal((await post('/api/showings/import', { previewId: preview.data.previewId }, otherAdmin.data.token)).status, 400);
        const imported = await post('/api/showings/import', { previewId: preview.data.previewId }, admin.data.token);
        assert.equal(imported.status, 200);
        assert.equal(imported.data.imported, 1);
        assert.equal(stored.length, 1);
        assert.equal((await post('/api/showings/import', { previewId: preview.data.previewId }, admin.data.token)).status, 400);
        const duplicate = await post('/api/showings/import/preview', { csv }, admin.data.token);
        assert.equal(duplicate.data.valid.length, 0);
        assert.equal(duplicate.data.invalid.length, 2);

        const newCsv = 'movie,datetime,theater,format\nMovie,2026-12-02 19:30,Main,2D';
        const stalePreview = await post('/api/showings/import/preview', { csv: newCsv }, admin.data.token);
        formatAvailable = false;
        const staleImport = await post('/api/showings/import', { previewId: stalePreview.data.previewId }, admin.data.token);
        assert.equal(staleImport.data.imported, 0);
        assert.equal(staleImport.data.invalid.length, 1);
        assert.equal(stored.length, 1);
        formatAvailable = true;
        const batch = 'movie,datetime,theater,format\nMovie,2026-12-03 19:30,Main,2D\nMovie,2026-12-04 19:30,Main,2D';
        const batchPreview = await post('/api/showings/import/preview', { csv: batch }, admin.data.token);
        failInsert = true;
        const failed = await post('/api/showings/import', { previewId: batchPreview.data.previewId }, admin.data.token);
        assert.equal(failed.status, 500);
        assert.equal(stored.length, 1);
        failInsert = false;
        const manual = await post('/api/showings', {
            movieId: 1, theaterId: 2, formatId: 3, showtime: '2026-12-05 19:30:00',
        }, admin.data.token);
        assert.equal(manual.status, 201);
        assert.equal(stored.length, 2);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        mysql.createPool = originalCreatePool;
        global.fetch = originalFetch;
        if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = previousKey;
        if (previousModel === undefined) delete process.env.ANTHROPIC_MODEL;
        else process.env.ANTHROPIC_MODEL = previousModel;
    }
});
