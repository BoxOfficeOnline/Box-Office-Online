const test = require('node:test');
const assert = require('node:assert/strict');
const { parseShowtimeCsv, normalizeShowtime, validateRows, ImportInputError } = require('../src/showtimeImport.ts');

test('Claude maps only headers while CSV parser preserves quoted values and rows', async () => {
    const originalFetch = global.fetch;
    const oldKey = process.env.ANTHROPIC_API_KEY;
    const oldModel = process.env.ANTHROPIC_MODEL;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.ANTHROPIC_MODEL = 'test-model';
    global.fetch = async (_url, request) => {
        const body = JSON.parse(request.body);
        assert.deepEqual(JSON.parse(body.messages[0].content), { headers: ['format', 'movie', 'theater', 'datetime'] });
        assert.ok(!request.body.includes('Example Movie'));
        return {
            ok: true,
            json: async () => ({ content: [{ type: 'tool_use', name: 'map_showtime_columns', input: {
                movie: 1, datetime: 3, theater: 2, format: 0,
            } }] }),
        };
    };
    try {
        const rows = await parseShowtimeCsv('format,movie,theater,datetime\n2D,"Example Movie, Part 2",Main,2026-12-01 19:30\n');
        assert.deepEqual(rows, [{
            record: 2, movie: 'Example Movie, Part 2', datetime: '2026-12-01 19:30',
            theater: 'Main', format: '2D',
        }]);
        await assert.rejects(() => parseShowtimeCsv('movie,datetime\n"unclosed'), ImportInputError);
        global.fetch = async () => ({
            ok: true,
            json: async () => ({ content: [{ type: 'tool_use', name: 'map_showtime_columns', input: {
                movie: 0, datetime: 0, theater: 0, format: 0,
            } }] }),
        });
        await assert.rejects(() => parseShowtimeCsv('movie,datetime,theater,format\nA,B,C,D'), ImportInputError);
    } finally {
        global.fetch = originalFetch;
        if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = oldKey;
        if (oldModel === undefined) delete process.env.ANTHROPIC_MODEL;
        else process.env.ANTHROPIC_MODEL = oldModel;
    }
});

test('dates must be unambiguous and represent a real calendar date', () => {
    assert.equal(normalizeShowtime('2028-02-29T23:59'), '2028-02-29 23:59:00');
    assert.equal(normalizeShowtime('2027-02-29 12:00'), null);
    assert.equal(normalizeShowtime('2026-04-31 12:00'), null);
    assert.equal(normalizeShowtime('2026-01-01 24:00'), null);
    assert.equal(normalizeShowtime('12/01/2026 7:30 PM'), null);
    assert.equal(normalizeShowtime('2026-01-01T10:00Z'), null);
});

test('validation accepts only matching unique showtimes and reports rejected records', async () => {
    const connection = {
        execute: async (sql, params) => {
            if (sql.includes('FROM movies')) return [params[0] === 'Movie' ? [{ movie_id: 1 }] : []];
            if (sql.includes('FROM theaters')) return [params[0] === 'Main' ? [{ theater_id: 2 }] : []];
            if (sql.includes('FROM formats')) return [params[1] === '2D' ? [{ format_id: 3 }] : []];
            if (sql.includes('FROM showing')) return [params[3] === '2026-12-01 20:00:00' ? [{ showing_id: 4 }] : []];
            throw new Error(`Unexpected SQL: ${sql}`);
        },
    };
    const row = { record: 2, movie: 'Movie', datetime: '2026-12-01 19:30', theater: 'Main', format: '2D' };
    const result = await validateRows(connection, [
        row,
        { ...row, record: 3 },
        { ...row, record: 4, movie: 'Unknown' },
        { ...row, record: 5, format: 'IMAX' },
        { ...row, record: 6, datetime: '2026-12-01 20:00' },
        { ...row, record: 7, datetime: '2026-02-29 20:00' },
        { ...row, record: 8, theater: '' },
    ]);
    assert.equal(result.valid.length, 1);
    assert.deepEqual(result.valid[0], {
        ...row, movieId: 1, theaterId: 2, formatId: 3, showtime: '2026-12-01 19:30:00',
    });
    assert.deepEqual(result.invalid.map((item) => item.record), [3, 4, 5, 6, 7, 8]);
    assert.match(result.invalid[0].error, /Duplicate/);
    assert.match(result.invalid[3].error, /already exists/);
});
