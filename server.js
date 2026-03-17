const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = path.join(__dirname, 'khanqah_library.db');

// Connect to local offline SQLite database
const db = new sqlite3.Database(DB_PATH);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

function trimOrNull(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
}

function isValidRating(rating) {
    return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

async function getExistingColumns(tableName) {
    const rows = await all(`PRAGMA table_info(${tableName})`);
    return new Set(rows.map((row) => row.name));
}

async function ensureColumns(tableName, columnStatements) {
    const existing = await getExistingColumns(tableName);

    for (const [columnName, statement] of Object.entries(columnStatements)) {
        if (!existing.has(columnName)) {
            await run(`ALTER TABLE ${tableName} ADD COLUMN ${statement}`);
        }
    }
}

async function initializeDatabase() {
    await run(`PRAGMA foreign_keys = ON`);

    await run(`CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        category TEXT,
        status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'issued', 'archived')),
        donated_by TEXT,
        donated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        issued_to TEXT,
        issued_at DATETIME,
        returned_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        user_name TEXT,
        action TEXT NOT NULL CHECK (action IN ('donated', 'issued', 'returned', 'reviewed')),
        note TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(book_id) REFERENCES books(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        reviewer_name TEXT,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(book_id) REFERENCES books(id)
    )`);

    // Migration support for older deployments that created slim tables.
    await ensureColumns('books', {
        category: 'category TEXT',
        donated_by: 'donated_by TEXT',
        donated_at: 'donated_at DATETIME',
        issued_to: 'issued_to TEXT',
        issued_at: 'issued_at DATETIME',
        returned_at: 'returned_at DATETIME',
        created_at: 'created_at DATETIME',
    });

    await ensureColumns('transactions', {
        note: 'note TEXT',
    });

    await ensureColumns('reviews', {
        reviewer_name: 'reviewer_name TEXT',
        created_at: 'created_at DATETIME',
    });

    await run(`CREATE INDEX IF NOT EXISTS idx_books_status ON books(status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_transactions_book_id ON transactions(book_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_reviews_book_id ON reviews(book_id)`);
}

app.get('/api/health', async (req, res) => {
    try {
        await get('SELECT 1 AS ok');
        res.json({ status: 'ok', app: 'wiselife-library', db: 'connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// --- KIOSK API ENDPOINTS ---

app.get('/api/books', async (req, res) => {
    try {
        const statusFilter = trimOrNull(req.query.status);
        const search = trimOrNull(req.query.search);

        const clauses = [];
        const params = [];

        if (statusFilter) {
            clauses.push('b.status = ?');
            params.push(statusFilter);
        }

        if (search) {
            clauses.push('(b.title LIKE ? OR b.author LIKE ? OR IFNULL(b.category, \'\') LIKE ?)');
            const like = `%${search}%`;
            params.push(like, like, like);
        }

        const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

        const books = await all(
            `SELECT
                b.id,
                b.title,
                b.author,
                b.category,
                b.status,
                b.issued_to,
                b.donated_by,
                b.created_at,
                ROUND(AVG(r.rating), 1) AS average_rating,
                COUNT(r.id) AS rating_count
            FROM books b
            LEFT JOIN reviews r ON r.book_id = b.id
            ${whereSql}
            GROUP BY b.id
            ORDER BY b.id DESC`,
            params
        );

        res.json({ books });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 1. Give away (Donate) a book
app.post('/api/books/giveaway', async (req, res) => {
    try {
        const title = trimOrNull(req.body.title);
        const author = trimOrNull(req.body.author);
        const category = trimOrNull(req.body.category);
        const donorName = trimOrNull(req.body.user_name);

        if (!title || !author) {
            return res.status(400).json({ error: 'Title and author are required.' });
        }

        const result = await run(
            `INSERT INTO books (title, author, category, donated_by, status)
            VALUES (?, ?, ?, ?, 'available')`,
            [title, author, category, donorName]
        );

        await run(
            `INSERT INTO transactions (book_id, user_name, action, note)
            VALUES (?, ?, 'donated', ?)`,
            [result.lastID, donorName, 'Book donated to library']
        );

        res.status(201).json({
            message: 'Book added successfully.',
            bookId: result.lastID,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Issue a book
app.post('/api/books/issue', async (req, res) => {
    try {
        const bookId = Number(req.body.book_id);
        const userName = trimOrNull(req.body.user_name);

        if (!bookId || !userName) {
            return res.status(400).json({ error: 'book_id and user_name are required.' });
        }

        const book = await get(`SELECT id, status FROM books WHERE id = ?`, [bookId]);
        if (!book) {
            return res.status(404).json({ error: 'Book not found.' });
        }

        if (book.status !== 'available') {
            return res.status(409).json({ error: 'Book is not available for issue.' });
        }

        await run(
            `UPDATE books
            SET status = 'issued', issued_to = ?, issued_at = CURRENT_TIMESTAMP, returned_at = NULL
            WHERE id = ?`,
            [userName, bookId]
        );

        await run(
            `INSERT INTO transactions (book_id, user_name, action, note)
            VALUES (?, ?, 'issued', ?)`,
            [bookId, userName, 'Book issued to reader']
        );

        res.json({ message: 'Book issued successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/books/return', async (req, res) => {
    try {
        const bookId = Number(req.body.book_id);
        const userName = trimOrNull(req.body.user_name);

        if (!bookId) {
            return res.status(400).json({ error: 'book_id is required.' });
        }

        const book = await get(`SELECT id, status FROM books WHERE id = ?`, [bookId]);
        if (!book) {
            return res.status(404).json({ error: 'Book not found.' });
        }

        if (book.status !== 'issued') {
            return res.status(409).json({ error: 'Book is not currently issued.' });
        }

        await run(
            `UPDATE books
            SET status = 'available', issued_to = NULL, returned_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [bookId]
        );

        await run(
            `INSERT INTO transactions (book_id, user_name, action, note)
            VALUES (?, ?, 'returned', ?)`,
            [bookId, userName, 'Book returned to shelf']
        );

        res.json({ message: 'Book returned successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Rate/Review a book
app.post('/api/books/review', async (req, res) => {
    try {
        const bookId = Number(req.body.book_id);
        const reviewerName = trimOrNull(req.body.user_name);
        const rating = Number(req.body.rating);
        const comment = trimOrNull(req.body.comment);

        if (!bookId || !isValidRating(rating)) {
            return res.status(400).json({ error: 'book_id and rating (1-5) are required.' });
        }

        const book = await get(`SELECT id FROM books WHERE id = ?`, [bookId]);
        if (!book) {
            return res.status(404).json({ error: 'Book not found.' });
        }

        await run(
            `INSERT INTO reviews (book_id, reviewer_name, rating, comment)
            VALUES (?, ?, ?, ?)`,
            [bookId, reviewerName, rating, comment]
        );

        await run(
            `INSERT INTO transactions (book_id, user_name, action, note)
            VALUES (?, ?, 'reviewed', ?)`,
            [bookId, reviewerName, `Rating: ${rating}`]
        );

        res.status(201).json({ message: 'Review submitted successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/books/:id/reviews', async (req, res) => {
    try {
        const bookId = Number(req.params.id);
        if (!bookId) {
            return res.status(400).json({ error: 'Invalid book id.' });
        }

        const reviews = await all(
            `SELECT id, book_id, reviewer_name, rating, comment, created_at
            FROM reviews
            WHERE book_id = ?
            ORDER BY created_at DESC`,
            [bookId]
        );

        res.json({ reviews });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ADMIN API ENDPOINTS ---

// Get all library analytics
app.get('/api/admin/stats', async (req, res) => {
    try {
        const summary = await get(
            `SELECT
                COUNT(*) AS total_books,
                SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available_books,
                SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END) AS issued_books,
                (SELECT COUNT(*) FROM reviews) AS total_reviews,
                (SELECT ROUND(AVG(rating), 2) FROM reviews) AS average_rating,
                (SELECT COUNT(*) FROM transactions WHERE action = 'issued') AS total_issues,
                (SELECT COUNT(*) FROM transactions WHERE action = 'donated') AS total_donations
            FROM books`
        );

        const topRatedBooks = await all(
            `SELECT
                b.id,
                b.title,
                b.author,
                ROUND(AVG(r.rating), 2) AS avg_rating,
                COUNT(r.id) AS review_count
            FROM books b
            JOIN reviews r ON r.book_id = b.id
            GROUP BY b.id
            HAVING COUNT(r.id) > 0
            ORDER BY avg_rating DESC, review_count DESC
            LIMIT 10`
        );

        const recentTransactions = await all(
            `SELECT
                t.id,
                t.book_id,
                b.title,
                t.user_name,
                t.action,
                t.note,
                t.date
            FROM transactions t
            LEFT JOIN books b ON b.id = t.book_id
            ORDER BY t.date DESC
            LIMIT 50`
        );

        const inventory = await all(
            `SELECT
                b.id,
                b.title,
                b.author,
                b.category,
                b.status,
                b.issued_to,
                ROUND(AVG(r.rating), 1) AS average_rating,
                COUNT(r.id) AS rating_count
            FROM books b
            LEFT JOIN reviews r ON r.book_id = b.id
            GROUP BY b.id
            ORDER BY b.id DESC`
        );

        const issuesPerDay = await all(
            `SELECT DATE(date) AS day, COUNT(*) AS count
            FROM transactions
            WHERE action = 'issued'
            GROUP BY DATE(date)
            ORDER BY day DESC
            LIMIT 14`
        );

        res.json({ summary, topRatedBooks, recentTransactions, inventory, issuesPerDay });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: 'Route not found.' });
});

initializeDatabase()
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Library kiosk running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    });
