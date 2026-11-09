// coded by Claude
// Turns the showtime CSV files admins upload into rows for the showing table.
// Every theater lays its schedule out differently, so this reads as many layouts as it can:
//   - one showtime per row, with the date and time together or in separate columns
//   - one row per day or per movie, with several times in one cell or across "Time 1, Time 2" columns
//   - a grid with the dates (or movie titles) across the header row
//   - no header row at all, title rows above the header, or blank cells that mean "same as above"
// Nothing here touches the database, index.ts passes in the movies, theaters, and formats to match against.

export type CsvMovie = { id: number; title: string };
export type CsvTheater = { id: number; name: string; location: string };
// Formats belong to a theater (each theater sets its own prices), a null theaterId means any theater
export type CsvFormat = { id: number; name: string; theaterId: number | null };

export type CsvShowing = {
    row: number;
    movieId: number;
    movieTitle: string;
    theaterId: number;
    theaterName: string;
    formatId: number | null;
    formatName: string | null;
    showtime: string;
    note: string | null;
};

// row is the spreadsheet row number the admin sees, 0 means the whole file
export type CsvProblem = { row: number; message: string };
export type CsvColumn = { heading: string; meaning: string };
export type CsvResult = { showings: CsvShowing[]; problems: CsvProblem[]; columns: CsvColumn[] };

export type CsvOptions = {
    movies: CsvMovie[];
    theaters: CsvTheater[];
    formats: CsvFormat[];
    defaultMovieId: number | null;
    defaultTheaterId: number;
    today?: Date;
};

type Ymd = { y: number; m: number; d: number };
type Clock = { h: number; min: number; meridiem: 'am' | 'pm' | null; leadingZero: boolean };
type Kind = 'when' | 'date' | 'time' | 'meridiem' | 'movie' | 'theater' | 'format' | 'ignore';
type Column = { kind: Kind; heading: string; dates?: Ymd[]; movie?: CsvMovie; theater?: CsvTheater };
type Lookup<T> = { found: T } | { error: string };
type DateContext = { dayFirst: boolean; today: Date };

const MAX_SHOWINGS = 5000;
const MAX_RANGE_DAYS = 62;

const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?(?![a-z])';
const ORDINAL = '(?:st|nd|rd|th)?';
const RANGE_WORD = '\\s*(?:-|–|—|to|thru|through|until|till)\\s*';
const YEAR_TAIL = '(?:,?[\\s-]*(20\\d{2})(?!\\d)|[-\'/](\\d{2})(?![\\d:.]))?';
const MERIDIEM = '(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|a|p)(?![a-z])';
const RANGE = /^\s*(-|–|—|to|thru|through|until|till)\s*$/i;

const DAY_MONTH_NAME = new RegExp(`(?<![\\d:./])(\\d{1,2})${ORDINAL}(?:\\s+of)?[\\s-]*${MONTH}${YEAR_TAIL}`, 'gi');
const MONTH_NAME_DAY = new RegExp(
    `\\b${MONTH}[\\s-]*(\\d{1,2})${ORDINAL}(?![\\d:.])(?:${RANGE_WORD}(\\d{1,2})${ORDINAL}(?![\\d:.])(?!\\s*[ap]\\.?m?\\b))?${YEAR_TAIL}`,
    'gi'
);
const ISO_DATE = /(?<!\d)(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?!\d)T?/g;
const COMPACT_DATE = /(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/g;
const NUMERIC_DATE = /(?<![\d:./])(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?![\d/]|[:.]\d)/g;
const SHORT_DATE = /(?<![\d:./])(\d{1,2})\/(\d{1,2})(?![\d/]|[:.]\d)/g;

const COLON_TIME = new RegExp(`(?<![\\d:.])(\\d{1,2}):(\\d{2})(?::\\d{2})?(?:\\s*${MERIDIEM})?(?!\\d)`, 'gi');
const DOT_TIME_WITH_MERIDIEM = new RegExp(`(?<![\\d:.])(\\d{1,2})\\.(\\d{2})\\s*${MERIDIEM}`, 'gi');
const HOUR_WITH_MERIDIEM = new RegExp(`(?<![\\d:.])(\\d{1,2})\\s*${MERIDIEM}`, 'gi');
const H_TIME = /(?<![\d:.])(\d{1,2})h(\d{2})(?!\d)/gi;
const DOT_TIME = /(?<![\d:.])(\d{1,2})\.(\d{2})(?![\d.])/g;
const MILITARY_TIME = /(?<![\d:.])([01]?\d|2[0-3])([0-5]\d)(?![\d:.])/g;

// Words theaters tack onto titles, like "Dune (IMAX 3D)" or "Wicked - Open Caption"
const TITLE_EXTRAS = /\b(2d|3d|imax|dolby|atmos|cinema|4dx|screenx|xd|rpx|d box|dbox|plf|35mm|70mm|laser|hfr|open caption|oc|cc|subtitled|subtitles|subs|dubbed|standard|digital|experience|early access)\b/g;
const PLAIN_FORMATS = ['standard', 'regular', 'digital', '2d', 'normal', 'std'];
// So "Part Two", "Part II", and "Part 2" all match each other
const NUMBER_WORDS: Record<string, string> = {
    one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
    ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9',
};
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function dateText(date: Ymd): string {
    return `${date.y}-${pad(date.m)}-${pad(date.d)}`;
}

function shortDate(date: Ymd): string {
    return `${MONTH_NAMES[date.m - 1]} ${date.d}`;
}

// "2026-11-13 19:30:00" -> "Fri, Nov 13, 2026 at 7:30 PM"
export function describeShowtime(showtime: string): string {
    const [y, m, d, h, min] = showtime.split(/[- :]/).map(Number);
    const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${DAY_NAMES[day]}, ${MONTH_NAMES[m - 1]} ${d}, ${y} at ${hour}:${pad(min)} ${h < 12 ? 'AM' : 'PM'}`;
}

// ts-node compiles for older JavaScript that cannot loop over matchAll, so collect the matches the long way
function allMatches(text: string, pattern: RegExp): RegExpExecArray[] {
    const matches: RegExpExecArray[] = [];
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        matches.push(match);
        if (match[0] === '') pattern.lastIndex++;
    }
    return matches;
}

function columnLetter(index: number): string {
    let letters = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    }
    return letters;
}

// ---------- Reading the file into rows ----------

function cleanCell(cell: string): string {
    // Excel writes ="7:00" to stop a cell from being turned into a number
    return cell.trim().replace(/^="(.*)"$/, '$1').trim();
}

function readRows(text: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch !== '"') {
                cell += ch;
            } else if (text[i + 1] === '"') {
                cell += '"';
                i++;
            } else {
                quoted = false;
            }
        } else if (ch === '"' && cell.trim() === '') {
            quoted = true;
            cell = '';
        } else if (ch === delimiter) {
            row.push(cleanCell(cell));
            cell = '';
        } else if (ch === '\n') {
            row.push(cleanCell(cell));
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += ch;
        }
    }
    if (quoted) {
        // A quote that never closes would swallow the rest of the file, so read it without quotes instead
        return readRows(text.replace(/"/g, ''), delimiter);
    }
    row.push(cleanCell(cell));
    rows.push(row);
    return delimiter === ',' ? rows.map(rejoinSplitDates) : rows;
}

// "Friday, November 13, 2026" typed without quotes gets cut apart at its commas, so glue the pieces back together
function rejoinSplitDates(row: string[]): string[] {
    const joined: string[] = [];
    for (const cell of row) {
        const last = joined[joined.length - 1];
        const isYear = /^20\d{2}$/.test(cell) && last !== undefined && new RegExp(`${MONTH}\\s*\\d{1,2}${ORDINAL}$`, 'i').test(last);
        const afterWeekday = last !== undefined && /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?$/i.test(last) && new RegExp(`^${MONTH}`, 'i').test(cell);
        if (isYear || afterWeekday) {
            joined[joined.length - 1] = `${last}, ${cell}`;
        } else {
            joined.push(cell);
        }
    }
    return joined;
}

// Excel saves with commas or semicolons depending on the computer's region, other programs use tabs or pipes
function pickDelimiter(text: string): string {
    const sample = text.split('\n').filter((line) => line.trim()).slice(0, 50).join('\n');
    let best = ',';
    let bestScore = 0;
    for (const delimiter of [',', ';', '\t', '|']) {
        const tally = new Map<number, number>();
        for (const row of readRows(sample, delimiter)) {
            if (row.length > 1) {
                tally.set(row.length, (tally.get(row.length) ?? 0) + 1);
            }
        }
        // The delimiter that splits the most lines into the same number of columns wins.
        // Tabs almost never show up inside a cell, so they win ties
        tally.forEach((lines, width) => {
            const score = lines * 100 + Math.min(width, 40) + (delimiter === '\t' ? 50 : 0);
            if (score > bestScore) {
                best = delimiter;
                bestScore = score;
            }
        });
    }
    return best;
}

// ---------- Dates ----------

function makeDate(year: number | null, month: number, day: number, ctx: DateContext): Ymd | null {
    if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) {
        return null;
    }
    let y = year;
    if (y === null) {
        // No year written, so use the next time that date comes around
        y = ctx.today.getFullYear();
        const cutoff = new Date(ctx.today.getFullYear(), ctx.today.getMonth(), ctx.today.getDate() - 60);
        if (new Date(y, month - 1, day) < cutoff) {
            y++;
        }
    } else if (y < 100) {
        y += 2000;
    }
    if (y < 2000 || y > 2100) {
        return null;
    }
    const check = new Date(Date.UTC(y, month - 1, day));
    if (check.getUTCMonth() !== month - 1) {
        return null;
    }
    return { y, m: month, d: day };
}

function numericDate(first: string, second: string, year: number | null, ctx: DateContext, separator = '/'): Ymd | null {
    // Dates written with dots, like 06.12.2026, are European and always put the day first
    const dayFirst = ctx.dayFirst || separator === '.';
    let month = Number(dayFirst ? second : first);
    let day = Number(dayFirst ? first : second);
    if (month > 12 && day <= 12) {
        [month, day] = [day, month];
    }
    return makeDate(year, month, day, ctx);
}

function monthNumber(name: string): number {
    return MONTH_NAMES.findIndex((month) => month.toLowerCase() === name.slice(0, 3).toLowerCase()) + 1;
}

function shortYear(fourDigits: string, twoDigits: string): number | null {
    if (fourDigits) return Number(fourDigits);
    if (twoDigits) return 2000 + Number(twoDigits);
    return null;
}

function spanDates(first: Ymd, last: Ymd): Ymd[] | null {
    const start = Date.UTC(first.y, first.m - 1, first.d);
    const end = Date.UTC(last.y, last.m - 1, last.d);
    const days = Math.round((end - start) / 86400000);
    if (days < 1 || days > MAX_RANGE_DAYS) {
        return null;
    }
    const dates: Ymd[] = [];
    for (let i = 0; i <= days; i++) {
        const day = new Date(start + i * 86400000);
        dates.push({ y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate() });
    }
    return dates;
}

// Finds every date in a cell, and hands back the text that is left so the times can be read from it
function findDates(text: string, ctx: DateContext): { dates: Ymd[]; rest: string } {
    let work = text;
    const found: { start: number; end: number; dates: Ymd[] }[] = [];
    const take = (pattern: RegExp, build: (groups: string[]) => Ymd[] | null) => {
        for (const match of allMatches(work, pattern)) {
            const dates = build(match.slice(1).map((group) => group ?? ''));
            if (!dates || dates.length === 0) continue;
            const start = match.index ?? 0;
            const end = start + match[0].length;
            found.push({ start, end, dates });
            // Blank it out without moving anything, so later patterns cannot read the same digits twice
            work = work.slice(0, start) + ' '.repeat(match[0].length) + work.slice(end);
        }
    };
    const one = (date: Ymd | null) => (date ? [date] : null);

    take(ISO_DATE, ([y, , m, d]) => one(makeDate(Number(y), Number(m), Number(d), ctx)));
    take(COMPACT_DATE, ([y, m, d]) => one(makeDate(Number(y), Number(m), Number(d), ctx)));
    take(DAY_MONTH_NAME, ([d, month, y4, y2]) => one(makeDate(shortYear(y4, y2), monthNumber(month), Number(d), ctx)));
    take(MONTH_NAME_DAY, ([month, d, endDay, y4, y2]) => {
        const first = makeDate(shortYear(y4, y2), monthNumber(month), Number(d), ctx);
        if (!first) return null;
        const last = endDay ? makeDate(first.y, first.m, Number(endDay), ctx) : null;
        return last ? (spanDates(first, last) ?? [first, last]) : [first];
    });
    take(NUMERIC_DATE, ([a, separator, b, y]) => one(numericDate(a, b, Number(y), ctx, separator)));
    take(SHORT_DATE, ([a, b]) => one(numericDate(a, b, null, ctx)));

    found.sort((a, b) => a.start - b.start);
    const dates: Ymd[] = [];
    for (let i = 0; i < found.length; i++) {
        const next = found[i + 1];
        // "11/13 - 11/19" or "Nov 13 thru Nov 19" means every day in between
        if (next && found[i].dates.length === 1 && next.dates.length === 1 && RANGE.test(text.slice(found[i].end, next.start))) {
            const span = spanDates(found[i].dates[0], next.dates[0]);
            if (span) {
                dates.push(...span);
                i++;
                continue;
            }
        }
        dates.push(...found[i].dates);
    }
    return { dates, rest: work };
}

// If any date like 25/12 shows up, the file writes the day first, so 05/06 means June 5th too
function prefersDayFirst(rows: string[][]): boolean {
    let dayFirst = 0;
    let monthFirst = 0;
    for (const row of rows) {
        for (const cell of row) {
            for (const pattern of [NUMERIC_DATE, SHORT_DATE]) {
                for (const match of allMatches(cell, pattern)) {
                    const first = Number(match[1]);
                    const second = Number(pattern === NUMERIC_DATE ? match[3] : match[2]);
                    if (first > 12 && second <= 12) dayFirst++;
                    if (second > 12 && first <= 12) monthFirst++;
                }
            }
        }
    }
    return dayFirst > monthFirst;
}

// ---------- Times ----------

function makeClock(hourText: string, minuteText: string, meridiemText: string): Clock | null {
    const h = Number(hourText);
    const min = Number(minuteText || '0');
    const meridiem = meridiemText ? (meridiemText[0].toLowerCase() === 'p' ? 'pm' : 'am') : null;
    if (min > 59 || (meridiem ? h > 12 : h > 23)) {
        return null;
    }
    return { h, min, meridiem, leadingZero: hourText.length === 2 && hourText[0] === '0' };
}

// Finds every time in a cell, like "1:00, 4:15 & 7:30pm" or "7p" or "1930"
function findTimes(text: string, kind: Kind): { clocks: Clock[]; rest: string } {
    let work = text;
    const found: { at: number; clock: Clock }[] = [];
    const take = (pattern: RegExp, build: (groups: string[]) => Clock | null) => {
        for (const match of allMatches(work, pattern)) {
            const clock = build(match.slice(1).map((group) => group ?? ''));
            if (!clock) continue;
            const at = match.index ?? 0;
            found.push({ at, clock });
            work = work.slice(0, at) + ' '.repeat(match[0].length) + work.slice(at + match[0].length);
        }
    };

    take(/\b(noon|midnight)\b/gi, ([word]) => makeClock('12', '00', word.toLowerCase() === 'noon' ? 'pm' : 'am'));
    take(COLON_TIME, ([h, m, meridiem]) => makeClock(h, m, meridiem));
    take(H_TIME, ([h, m]) => makeClock(h, m, ''));
    take(DOT_TIME_WITH_MERIDIEM, ([h, m, meridiem]) => makeClock(h, m, meridiem));
    take(HOUR_WITH_MERIDIEM, ([h, meridiem]) => makeClock(h, '00', meridiem));
    // Plain numbers like 19.30 or 1930 could be anything, so only read them in a column that is labeled as times
    if (kind === 'time') {
        take(DOT_TIME, ([h, m]) => makeClock(h, m, ''));
        take(MILITARY_TIME, ([h, m]) => makeClock(h, m, ''));
    }

    found.sort((a, b) => a.at - b.at);
    return { clocks: found.map((f) => f.clock), rest: work };
}

function readMeridiem(cell: string): 'am' | 'pm' | null {
    const match = /^([ap])\.?\s?m?\.?$/i.exec(cell);
    if (!match) return null;
    return match[1].toLowerCase() === 'p' ? 'pm' : 'am';
}

function readWhen(cell: string, kind: Kind, ctx: DateContext): { dates: Ymd[]; clocks: Clock[]; extra: string } {
    // Excel sometimes saves dates as day counts, like 46339.8125 for Nov 13, 2026 at 7:30 PM
    if (kind !== 'time' && /^\d{5}(\.\d+)?$/.test(cell)) {
        const serial = Number(cell);
        if (serial >= 20000 && serial <= 80000) {
            const whole = Math.floor(serial);
            const day = new Date(Date.UTC(1899, 11, 30) + whole * 86400000);
            const minutes = Math.round((serial - whole) * 1440);
            return {
                dates: [{ y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate() }],
                clocks: minutes > 0 ? [{ h: Math.floor(minutes / 60), min: minutes % 60, meridiem: null, leadingZero: true }] : [],
                extra: '',
            };
        }
    }
    // and times as parts of a day, like 0.8125 for 7:30 PM
    if (kind === 'time' && /^0?\.\d+$/.test(cell)) {
        const minutes = Math.round(Number(cell) * 1440) % 1440;
        return { dates: [], clocks: [{ h: Math.floor(minutes / 60), min: minutes % 60, meridiem: null, leadingZero: true }], extra: '' };
    }
    const found = findDates(cell, ctx);
    const times = findTimes(found.rest, kind);
    return { dates: found.dates, clocks: times.clocks, extra: times.rest };
}

// ---------- Matching movies, theaters, and formats ----------

function simplify(text: string): string {
    return text
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function titleKey(text: string): string {
    return simplify(text.replace(/[([][^)\]]*[)\]]/g, ' '))
        .replace(TITLE_EXTRAS, ' ')
        .replace(/\b[a-z]+\b/g, (word) => NUMBER_WORDS[word] ?? word)
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(the|a|an) /, '');
}

function theaterNames(theater: CsvTheater): string[] {
    return [theater.name, theater.location, `${theater.name} ${theater.location}`];
}

// Exact match first, then ignoring "The", punctuation, and extras like (IMAX), then (if loose) a name inside the cell
function bestMatch<T>(text: string, items: T[], names: (item: T) => string[], loose: boolean): T | 'many' | null {
    const unique = (hits: T[]) => (hits.length === 1 ? hits[0] : hits.length > 1 ? ('many' as const) : null);
    const plain = simplify(text);
    if (!plain) return null;
    const exact = unique(items.filter((item) => names(item).some((name) => simplify(name) === plain)));
    if (exact) return exact;
    const key = titleKey(text);
    if (!key) return null;
    const close = unique(items.filter((item) => names(item).some((name) => titleKey(name) === key)));
    if (close || !loose) return close;

    // A name inside the cell, like "Dune Part Two Early Access Fan Event", picks the longest name that fits
    let best: T | null = null;
    let bestLength = 0;
    let tied = false;
    for (const item of items) {
        for (const name of names(item)) {
            const nameKey = titleKey(name);
            if (nameKey.length < 4 || !` ${key} `.includes(` ${nameKey} `)) continue;
            if (nameKey.length > bestLength) {
                best = item;
                bestLength = nameKey.length;
                tied = false;
            } else if (nameKey.length === bestLength && item !== best) {
                tied = true;
            }
        }
    }
    if (best) return tied ? 'many' : best;

    // The cell inside a name, like "Wicked" for "Wicked: For Good", only when just one name fits
    if (key.length < 4) return null;
    return unique(items.filter((item) => names(item).some((name) => ` ${titleKey(name)} `.includes(` ${key} `))));
}

function matchMovie(text: string, movies: CsvMovie[], allowId: boolean): Lookup<CsvMovie> {
    if (allowId && /^\d+$/.test(text)) {
        const byId = movies.find((movie) => movie.id === Number(text));
        if (byId) return { found: byId };
    }
    const hit = bestMatch(text, movies, (movie) => [movie.title], true);
    if (hit === 'many') return { error: `"${text}" could be more than one movie on the site. Use the movie's full title.` };
    if (!hit) return { error: `There is no movie called "${text}" on the site yet. Add the movie first, or fix the title in the file.` };
    return { found: hit };
}

function matchTheater(text: string, theaters: CsvTheater[], allowId: boolean): Lookup<CsvTheater> {
    if (allowId && /^\d+$/.test(text)) {
        const byId = theaters.find((theater) => theater.id === Number(text));
        if (byId) return { found: byId };
    }
    const hit = bestMatch(text, theaters, theaterNames, true);
    if (hit === 'many') return { error: `"${text}" could be more than one theater. Use the theater's full name.` };
    if (!hit) return { error: `There is no theater called "${text}" on the site.` };
    return { found: hit };
}

function findFormat(text: string, allFormats: CsvFormat[], theaterId: number | null): CsvFormat | null {
    const cell = simplify(text);
    if (!cell) return null;
    const formats = theaterId === null ? allFormats : allFormats.filter((format) => format.theaterId === null || format.theaterId === theaterId);
    const exact = formats.find((format) => simplify(format.name) === cell);
    if (exact) return exact;
    let best: CsvFormat | null = null;
    for (const format of formats) {
        const name = simplify(format.name);
        if (name && ` ${cell} `.includes(` ${name} `) && name.length > (best ? simplify(best.name).length : 0)) {
            best = format;
        }
    }
    if (best) return best;
    if (PLAIN_FORMATS.includes(cell)) {
        return formats.find((format) => PLAIN_FORMATS.includes(simplify(format.name))) ?? null;
    }
    return null;
}

// ---------- Working out what each column holds ----------

function classifyHeading(cell: string, options: CsvOptions, ctx: DateContext): Column | null {
    const words = simplify(cell);
    if (!words || words.length > 40) return null;
    const has = (pattern: RegExp) => pattern.test(words);

    // A date as the heading, like "Fri 11/13", means the times under it are for that day
    const headingDates = findDates(cell, ctx);
    if (headingDates.dates.length > 0 && findTimes(headingDates.rest, 'when').clocks.length === 0) {
        return { kind: 'time', heading: cell, dates: headingDates.dates };
    }
    // A movie or theater as the heading, like "Date, Dune, Wicked", means the times under it are for that one.
    // Checked before the keywords so titles like "The Day After Tomorrow" are not read as a date column,
    // but a one word heading like "Time" is always the keyword
    const movie = bestMatch(cell, options.movies, (m) => [m.title], false);
    const theater = bestMatch(cell, options.theaters, theaterNames, false);
    if (words.includes(' ')) {
        if (movie && movie !== 'many') return { kind: 'time', heading: cell, movie };
        if (theater && theater !== 'many') return { kind: 'time', heading: cell, theater };
    }
    if (has(/^(am ?pm|am or pm|a m p m|period|meridiem)$/)) return { kind: 'meridiem', heading: cell };
    if (has(/\b(end|ends|ending|finish|finishes|stop|out)\b/)) return { kind: 'ignore', heading: cell };
    if (has(/\b(formats?|presentations?|projection|versions?|types?|experiences?)\b/)) return { kind: 'format', heading: cell };
    if (has(/\b(names?|titles?)\b/)) {
        return { kind: has(/\b(theaters?|theatres?|cinemas?|venues?|locations?|sites?)\b/) ? 'theater' : 'movie', heading: cell };
    }
    if (has(/\b(theaters?|theatres?|cinemas?|venues?|locations?|sites?|multiplex)\b/)) return { kind: 'theater', heading: cell };
    const date = has(/\b(dates?|days?|dt)\b/);
    const time = has(/\b(times?|showtimes?|starts?|starting|begins?|sessions?|perfs?|performances?|screenings?|showings?|hours?)\b/);
    // "Show Date" is a date, but "Show 1" or "Shows" is a time
    const show = has(/\bshows?\b/);
    if (date && time) return { kind: 'when', heading: cell };
    if (date) return { kind: 'date', heading: cell };
    if (time || show) return { kind: 'time', heading: cell };
    if (has(/\b(movies?|films?|features?|pictures?|attractions?)\b/)) return { kind: 'movie', heading: cell };
    if (has(/\b(runtime|run time|length|duration|rating|rated|mpaa|prices?|cost|screens?|auditoriums?|aud|seats?|capacity|notes?|comments?|genres?|languages?|status|id|number|no)\b/)) {
        return { kind: 'ignore', heading: cell };
    }
    if (movie && movie !== 'many') return { kind: 'time', heading: cell, movie };
    if (theater && theater !== 'many') return { kind: 'time', heading: cell, theater };
    return null;
}

// For files with no header, or headings we do not recognize, look at what is in the column
function inferColumn(index: number, dataRows: string[][], heading: string, options: CsvOptions, ctx: DateContext): Column {
    let filled = 0;
    let timing = 0;
    let meridiems = 0;
    let movies = 0;
    let theaters = 0;
    let formats = 0;
    for (const row of dataRows.slice(0, 300)) {
        const cell = row[index];
        if (!cell) continue;
        filled++;
        const when = readWhen(cell, 'when', ctx);
        if (when.dates.length > 0 || when.clocks.length > 0) timing++;
        else if (readMeridiem(cell)) meridiems++;
        else if ('found' in matchMovie(cell, options.movies, false)) movies++;
        else if ('found' in matchTheater(cell, options.theaters, false)) theaters++;
        else if (findFormat(cell, options.formats, null)) formats++;
    }
    const most = (count: number) => filled > 0 && count * 2 >= filled;
    if (most(timing)) return { kind: 'when', heading };
    if (most(meridiems)) return { kind: 'meridiem', heading };
    if (most(movies)) return { kind: 'movie', heading };
    if (most(theaters)) return { kind: 'theater', heading };
    if (most(formats)) return { kind: 'format', heading };
    return { kind: 'ignore', heading };
}

// The header is the row near the top with the most headings we recognize and no times in it
function findHeader(rows: string[][], options: CsvOptions, ctx: DateContext): number {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const cells = rows[i].filter((cell) => cell);
        if (cells.length === 0) continue;
        if (cells.some((cell) => readWhen(cell, 'when', ctx).clocks.length > 0)) continue;
        let keywords = 0;
        let fixed = 0;
        for (const cell of cells) {
            const column = classifyHeading(cell, options, ctx);
            if (!column) continue;
            if (column.dates || column.movie || column.theater) fixed++;
            else keywords++;
        }
        // A lone title like "Dune" or "Week of 11/13" is not a header, but a lone "Showtime" can be
        if (keywords === 0 && fixed < 2) continue;
        if (cells.length < 2 && fixed > 0) continue;
        const score = keywords * 2 + fixed;
        if (score > bestScore) {
            best = i;
            bestScore = score;
        }
    }
    return best;
}

function describeColumn(column: Column): string {
    switch (column.kind) {
        case 'when': return 'Dates and times';
        case 'date': return 'Dates';
        case 'meridiem': return 'AM or PM';
        case 'movie': return 'Movie';
        case 'theater': return 'Theater';
        case 'format': return 'Format';
        case 'ignore': return 'Not used';
        case 'time': {
            if (column.dates && column.dates.length > 1) return `Times every day from ${shortDate(column.dates[0])} to ${shortDate(column.dates[column.dates.length - 1])}`;
            if (column.dates) return `Times on ${shortDate(column.dates[0])}`;
            if (column.movie) return `Times for ${column.movie.title}`;
            if (column.theater) return `Times at ${column.theater.name}`;
            return 'Times';
        }
    }
}

// ---------- Putting it together ----------

export function readShowtimeCsv(text: string, options: CsvOptions): CsvResult {
    const today = options.today ?? new Date();
    const problems: CsvProblem[] = [];

    let clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
    // Excel understands a first line of "sep=;" to say which delimiter the file uses, and hides it
    const sepLine = /^sep=(.)\n/i.exec(clean);
    if (sepLine) clean = clean.slice(sepLine[0].length);
    const rows = readRows(clean, sepLine ? sepLine[1] : pickDelimiter(clean));
    const ctx: DateContext = { dayFirst: prefersDayFirst(rows), today };

    const headerIndex = findHeader(rows, options, ctx);
    const header = headerIndex >= 0 ? rows[headerIndex] : [];
    const dataStart = headerIndex + 1;
    const dataRows = rows.slice(dataStart);
    const width = rows.reduce((most, row) => Math.max(most, row.length), 0);

    const columns: Column[] = [];
    for (let j = 0; j < width; j++) {
        const heading = header[j] ?? '';
        columns.push(classifyHeading(heading, options, ctx) ?? inferColumn(j, dataRows, heading, options, ctx));
    }

    const defaultMovie = options.movies.find((movie) => movie.id === options.defaultMovieId);
    const fallbackMovie: Lookup<CsvMovie> = defaultMovie
        ? { found: defaultMovie }
        : { error: 'The file does not say which movie this is for. Pick the movie on the upload page.' };
    const defaultTheater = options.theaters.find((theater) => theater.id === options.defaultTheaterId);
    const fallbackTheater: Lookup<CsvTheater> = defaultTheater
        ? { found: defaultTheater }
        : { error: 'The file does not say which theater this is for. Pick the theater on the upload page.' };

    let currentMovie: Lookup<CsvMovie> | null = null;
    let currentTheater: Lookup<CsvTheater> | null = null;
    let carriedDates: Ymd[] = [];

    // A row with just a movie or theater name in it, like a title above the header or "Dune" above its times,
    // applies to the rows under it
    const readTitleRow = (cells: string[]) => {
        const filled = cells.filter((cell) => cell);
        if (filled.length === 0 || filled.length > 3) return;
        for (const cell of filled) {
            const movie = bestMatch(cell, options.movies, (m) => [m.title], true);
            if (movie && movie !== 'many') {
                currentMovie = { found: movie };
                continue;
            }
            const theater = bestMatch(cell, options.theaters, theaterNames, true);
            if (theater && theater !== 'many') currentTheater = { found: theater };
        }
    };
    for (const cells of rows.slice(0, Math.max(headerIndex, 0))) {
        readTitleRow(cells);
    }

    type Pending = { row: number; movie: CsvMovie; theater: CsvTheater; format: CsvFormat | null; formatNote: string | null; date: Ymd; clock: Clock };
    const pending: Pending[] = [];
    const headerText = header.join('|').toLowerCase();

    for (let offset = 0; offset < dataRows.length; offset++) {
        const cells = dataRows[offset];
        const row = dataStart + offset + 1;
        if (!cells.some((cell) => cell)) continue;
        // Some exports repeat the header on every page
        if (headerIndex >= 0 && cells.join('|').toLowerCase() === headerText) continue;

        let movieText: string | null = null;
        let theaterText: string | null = null;
        let formatText: string | null = null;
        let meridiem: 'am' | 'pm' | null = null;
        const rowDates: Ymd[] = [];
        const timeCells: { clocks: Clock[]; dates: Ymd[]; extra: string; column: Column; text: string }[] = [];

        for (let j = 0; j < columns.length; j++) {
            const column = columns[j];
            const cell = cells[j] ?? '';
            if (!cell) continue;
            if (column.kind === 'movie') movieText ??= cell;
            else if (column.kind === 'theater') theaterText ??= cell;
            else if (column.kind === 'format') formatText ??= cell;
            else if (column.kind === 'meridiem') meridiem = readMeridiem(cell) ?? meridiem;
            else if (column.kind !== 'ignore') {
                const when = readWhen(cell, column.kind, ctx);
                if (when.clocks.length > 0) timeCells.push({ ...when, column, text: cell });
                else rowDates.push(...when.dates);
            }
        }

        // Blank movie, theater, and date cells mean "same as the row above"
        if (movieText !== null) currentMovie = matchMovie(movieText, options.movies, true);
        if (theaterText !== null) currentTheater = matchTheater(theaterText, options.theaters, true);
        if (rowDates.length > 0) carriedDates = rowDates;

        if (timeCells.length === 0) {
            if (rowDates.length === 0 && movieText === null && theaterText === null) readTitleRow(cells);
            continue;
        }

        for (const cell of timeCells) {
            const dates = cell.dates.length > 0 ? cell.dates : rowDates.length > 0 ? rowDates : (cell.column.dates ?? carriedDates);
            if (dates.length === 0) {
                problems.push({ row, message: `Found the time "${cell.text}" but no date for it. Put the date in its own column or next to the time.` });
                continue;
            }
            const movie: Lookup<CsvMovie> = cell.column.movie ? { found: cell.column.movie } : (currentMovie ?? fallbackMovie);
            const theater: Lookup<CsvTheater> = cell.column.theater ? { found: cell.column.theater } : (currentTheater ?? fallbackTheater);
            if ('error' in movie) {
                problems.push({ row, message: movie.error });
                continue;
            }
            if ('error' in theater) {
                problems.push({ row, message: theater.error });
                continue;
            }
            const theaterId = theater.found.id;
            let format: CsvFormat | null;
            let formatNote: string | null = null;
            if (formatText !== null) {
                format = findFormat(formatText, options.formats, theaterId);
                if (!format && !PLAIN_FORMATS.includes(simplify(formatText))) {
                    formatNote = `"${formatText}" is not a format at ${theater.found.name} yet, so this was added without a format.`;
                }
            } else {
                // No format column, so look for one written next to the time or in the title, like "7:00 (3D)" or "Dune IMAX"
                format = findFormat(cell.extra, options.formats, theaterId) ?? (movieText ? findFormat(movieText, options.formats, theaterId) : null);
            }
            for (const date of dates) {
                for (const clock of cell.clocks) {
                    pending.push({
                        row,
                        movie: movie.found,
                        theater: theater.found,
                        format,
                        formatNote,
                        date,
                        clock: clock.meridiem || !meridiem ? clock : { ...clock, meridiem },
                    });
                }
            }
        }
    }

    if (pending.length > MAX_SHOWINGS) {
        problems.push({ row: 0, message: `This file has more than ${MAX_SHOWINGS} showtimes, so only the first ${MAX_SHOWINGS} were read. Split it into smaller files.` });
        pending.length = MAX_SHOWINGS;
    }

    // A file that ever writes 19:30 or 09:30 uses a 24 hour clock, so 7:30 there really means morning
    const uses24Hour = pending.some((p) => p.clock.meridiem === null && (p.clock.h >= 13 || p.clock.h === 0 || p.clock.leadingZero));
    const latest = new Map<string, number>();
    const seen = new Map<string, number>();
    const showings: CsvShowing[] = [];
    const oldest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

    for (const p of pending) {
        const { h, min, meridiem } = p.clock;
        const dayKey = `${p.movie.id}|${p.theater.id}|${dateText(p.date)}`;
        let hour: number;
        let guessed = false;
        if (meridiem) {
            hour = (h % 12) + (meridiem === 'pm' ? 12 : 0);
        } else if (uses24Hour) {
            hour = h;
        } else {
            // No AM or PM anywhere, so guess like a movie listing: 1:00-9:59 is afternoon or evening,
            // 10 and 11 are morning unless they come after a later show that day ("..., 8:00, 10:45")
            guessed = true;
            hour = h === 12 || h >= 10 ? h : h + 12;
            if ((h === 10 || h === 11) && (latest.get(dayKey) ?? -1) >= hour * 60 + min) {
                hour += 12;
            }
        }
        latest.set(dayKey, Math.max(latest.get(dayKey) ?? -1, hour * 60 + min));

        const showtime = `${dateText(p.date)} ${pad(hour)}:${pad(min)}:00`;
        if (new Date(p.date.y, p.date.m - 1, p.date.d) < oldest) {
            problems.push({ row: p.row, message: `${p.movie.title} on ${describeShowtime(showtime)} has already passed.` });
            continue;
        }
        const key = `${p.movie.id}|${p.theater.id}|${showtime}`;
        const firstRow = seen.get(key);
        if (firstRow !== undefined) {
            problems.push({ row: p.row, message: `${p.movie.title} on ${describeShowtime(showtime)} is listed more than once (first on row ${firstRow}), so it is only added once.` });
            continue;
        }
        seen.set(key, p.row);

        const notes = [guessed ? 'The file did not say AM or PM, so this is our best guess.' : null, p.formatNote].filter(Boolean);
        showings.push({
            row: p.row,
            movieId: p.movie.id,
            movieTitle: p.movie.title,
            theaterId: p.theater.id,
            theaterName: p.theater.name,
            formatId: p.format ? p.format.id : null,
            formatName: p.format ? p.format.name : null,
            showtime,
            note: notes.length > 0 ? notes.join(' ') : null,
        });
    }

    if (showings.length === 0 && problems.length === 0) {
        problems.push({ row: 0, message: 'We could not find any showtimes in this file. Make sure it has a date and a time for each showing.' });
    }
    problems.sort((a, b) => a.row - b.row);

    const usedColumns: CsvColumn[] = [];
    columns.forEach((column, j) => {
        if (!column.heading && !dataRows.some((cells) => cells[j])) return;
        usedColumns.push({ heading: column.heading || `Column ${columnLetter(j)}`, meaning: describeColumn(column) });
    });

    return { showings, problems, columns: usedColumns };
}
