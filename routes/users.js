const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');

// Get user profile
router.get('/profile/:username', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, karma, avatar_url, avatar_config, created_at FROM users WHERE username = $1', [req.params.username]);
        const user = result.rows[0];
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get user posts
router.get('/profile/:username/posts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, u.username, u.avatar_url,
            (SELECT COALESCE(SUM(vote_type), 0) FROM votes WHERE post_id = p.id) as score,
            (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
            (SELECT COUNT(*) FROM post_awards WHERE post_id = p.id) as award_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE u.username = $1
            ORDER BY p.created_at DESC
        `, [req.params.username]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get user comments
router.get('/profile/:username/comments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, p.content as post_content
            FROM comments c
            JOIN users u ON c.user_id = u.id
            JOIN posts p ON c.post_id = p.id
            WHERE u.username = $1
            ORDER BY c.created_at DESC
        `, [req.params.username]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
