const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { authenticateToken } = require('./authMiddleware');
const { upload } = require('../config/cloudinary');

// Get comments for a post
router.get('/:postId', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, u.username 
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.post_id = $1
            ORDER BY c.created_at ASC
        `, [req.params.postId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add a comment
router.post('/:postId', authenticateToken, upload.single('media'), async (req, res) => {
    const { content } = req.body;
    const postId = req.params.postId;
    const userId = req.user.id;
    const mediaUrl = req.file ? req.file.path : null;

    try {
        const result = await pool.query(
            'INSERT INTO comments (post_id, user_id, content, media_url) VALUES ($1, $2, $3, $4) RETURNING id',
            [postId, userId, content, mediaUrl]
        );
        res.status(201).json({ id: result.rows[0].id, message: 'Comment added' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Edit a comment
router.put('/:id', authenticateToken, async (req, res) => {
    const commentId = req.params.id;
    const userId = req.user.id;
    const { content } = req.body;

    try {
        const checkResult = await pool.query('SELECT user_id FROM comments WHERE id = $1', [commentId]);
        const comment = checkResult.rows[0];
        
        if (!comment) return res.status(404).json({ error: 'Comment not found' });
        if (comment.user_id !== userId) return res.status(403).json({ error: 'Unauthorized' });

        await pool.query('UPDATE comments SET content = $1, is_edited = 1 WHERE id = $2', [content, commentId]);
        
        res.json({ message: 'Comment updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a comment
router.delete('/:id', authenticateToken, async (req, res) => {
    const commentId = req.params.id;
    const userId = req.user.id;

    try {
        const checkResult = await pool.query('SELECT user_id FROM comments WHERE id = $1', [commentId]);
        const comment = checkResult.rows[0];
        
        if (!comment) return res.status(404).json({ error: 'Comment not found' });
        if (comment.user_id !== userId) return res.status(403).json({ error: 'Unauthorized' });

        await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
        
        res.json({ message: 'Comment deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
