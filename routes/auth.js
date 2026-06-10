const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/database');
const { SECRET_KEY } = require('./authMiddleware');
const { upload } = require('../config/cloudinary');
const { authenticateToken } = require('./authMiddleware');

router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
            [username, hashedPassword]
        );
        res.status(201).json({ id: result.rows[0].id, username });
    } catch (err) {
        if (err.message.includes('unique constraint')) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];
        
        if (!user) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, username: user.username } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, karma, avatar_url FROM users WHERE id = $1', [req.user.id]);
        const user = result.rows[0];
        
        const awardsResult = await pool.query('SELECT award_type FROM user_exclusive_awards WHERE user_id = $1', [req.user.id]);
        const exclusiveAwards = awardsResult.rows.map(a => a.award_type);
        
        res.json({ ...user, exclusiveAwards });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get user inventory
router.get('/inventory', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT award_type, count FROM user_inventory WHERE user_id = $1 AND count > 0', [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update avatar
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    const { avatarUrl, config } = req.body;
    
    try {
        let finalUrl = avatarUrl;
        if (req.file) {
            finalUrl = req.file.path; // Cloudinary URL
        }

        await pool.query(
            'UPDATE users SET avatar_url = $1, avatar_config = $2 WHERE id = $3',
            [finalUrl, config || null, req.user.id]
        );

        res.json({ message: 'Avatar updated', avatar_url: finalUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
