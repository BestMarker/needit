const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { authenticateToken } = require('./authMiddleware');

// Get list of users (excluding self) to message
router.get('/users', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username FROM users WHERE id != $1', [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get chat history with a specific user
router.get('/history/:userId', authenticateToken, async (req, res) => {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;

    try {
        const result = await pool.query(`
            SELECT * FROM messages
            WHERE (sender_id = $1 AND receiver_id = $2)
               OR (sender_id = $3 AND receiver_id = $4)
            ORDER BY created_at ASC
        `, [currentUserId, otherUserId, otherUserId, currentUserId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save a new message
router.post('/send', authenticateToken, async (req, res) => {
    const { receiverId, content } = req.body;
    const senderId = req.user.id;

    try {
        const result = await pool.query(
            'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING id',
            [senderId, receiverId, content]
        );
        res.status(201).json({ id: result.rows[0].id, message: 'Message saved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
