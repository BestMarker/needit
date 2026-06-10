const express = require('express');
const router = express.Router();
const path = require('path');
const { pool } = require('../db/database');
const { authenticateToken } = require('./authMiddleware');
const { upload } = require('../config/cloudinary');

// Get all posts (with vote count and award count summary)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, u.username, u.avatar_url,
            (SELECT COALESCE(SUM(vote_type), 0) FROM votes WHERE post_id = p.id) as score,
            (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
            (SELECT COUNT(*) FROM post_awards WHERE post_id = p.id) as award_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get a single post with awards
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, u.username, u.avatar_url, u.karma as user_karma,
            (SELECT COALESCE(SUM(vote_type), 0) FROM votes WHERE post_id = p.id) as score
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `, [req.params.id]);
        
        const post = result.rows[0];
        
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const awardsResult = await pool.query(`
            SELECT award_type, COUNT(*) as count 
            FROM post_awards 
            WHERE post_id = $1 
            GROUP BY award_type
        `, [post.id]);
        
        post.awards = awardsResult.rows;
        res.json(post);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new post
router.post('/', authenticateToken, upload.array('media', 20), async (req, res) => {
    const { content, type } = req.body;
    const userId = req.user.id;
    let mediaUrl = null;
    
    if (req.files && req.files.length > 0) {
        // req.file.path holds the Cloudinary URL
        mediaUrl = JSON.stringify(req.files.map(f => f.path));
    } else if (req.file) {
        mediaUrl = req.file.path;
    }

    try {
        const result = await pool.query(
            'INSERT INTO posts (user_id, type, content, media_url) VALUES ($1, $2, $3, $4) RETURNING id',
            [userId, type, content, mediaUrl]
        );
        const postId = result.rows[0].id;
        
        // Auto upvote own post
        await pool.query('INSERT INTO votes (post_id, user_id, vote_type) VALUES ($1, $2, 1)', [postId, userId]);

        res.status(201).json({ id: postId, message: 'Post created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Vote on a post and update Karma
router.post('/:id/vote', authenticateToken, async (req, res) => {
    const postId = req.params.id;
    const userId = req.user.id;
    const { voteType } = req.body; 

    try {
        const checkResult = await pool.query('SELECT * FROM votes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
        const existingVote = checkResult.rows[0];

        const postResult = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
        const postOwner = postResult.rows[0];
        
        if (!postOwner) return res.status(404).json({ error: 'Post not found' });

        let karmaChange = 0;

        if (existingVote) {
            if (existingVote.vote_type == voteType) {
                // Remove vote if clicking same button
                await pool.query('DELETE FROM votes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
                karmaChange = existingVote.vote_type == 1 ? -1 : 1;
            } else {
                // Change vote
                await pool.query('UPDATE votes SET vote_type = $1 WHERE post_id = $2 AND user_id = $3', [voteType, postId, userId]);
                karmaChange = voteType == 1 ? 2 : -2;
            }
        } else {
            // New vote
            await pool.query('INSERT INTO votes (post_id, user_id, vote_type) VALUES ($1, $2, $3)', [postId, userId, voteType]);
            karmaChange = voteType;
        }

        // Update post owner's karma
        if (karmaChange !== 0 && postOwner.user_id !== userId) {
            await pool.query('UPDATE users SET karma = karma + $1 WHERE id = $2', [karmaChange, postOwner.user_id]);
        }

        res.json({ message: 'Vote processed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Give an Award to a post
router.post('/:id/award', authenticateToken, async (req, res) => {
    const postId = req.params.id;
    const senderId = req.user.id;
    const { awardType, cost, useInventory } = req.body; 

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const postResult = await client.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
        const post = postResult.rows[0];
        if (!post) throw new Error("Gönderi bulunamadı.");

        if (useInventory) {
            const checkInv = await client.query('SELECT count FROM user_inventory WHERE user_id = $1 AND award_type = $2', [senderId, awardType]);
            const inv = checkInv.rows[0];
            if (!inv || inv.count < 1) {
                throw new Error("Envanterde bu ödül bulunmuyor.");
            }
            await client.query('UPDATE user_inventory SET count = count - 1 WHERE user_id = $1 AND award_type = $2', [senderId, awardType]);
        } else {
            const userResult = await client.query('SELECT karma FROM users WHERE id = $1', [senderId]);
            const sender = userResult.rows[0];
            if (sender.karma < cost) {
                throw new Error("Yetersiz Karma.");
            }
            await client.query('UPDATE users SET karma = karma - $1 WHERE id = $2', [cost, senderId]);
        }

        await client.query('INSERT INTO post_awards (post_id, sender_id, award_type, cost) VALUES ($1, $2, $3, $4)', [postId, senderId, awardType, useInventory ? 0 : cost]);

        const checkOwnerInv = await client.query('SELECT count FROM user_inventory WHERE user_id = $1 AND award_type = $2', [post.user_id, awardType]);
        if (checkOwnerInv.rows.length > 0) {
            await client.query('UPDATE user_inventory SET count = count + 1 WHERE user_id = $1 AND award_type = $2', [post.user_id, awardType]);
        } else {
            await client.query('INSERT INTO user_inventory (user_id, award_type, count) VALUES ($1, $2, 1)', [post.user_id, awardType]);
        }

        await client.query('COMMIT');
        res.json({ message: 'Award given successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Edit a post
router.put('/:id', authenticateToken, async (req, res) => {
    const postId = req.params.id;
    const userId = req.user.id;
    const { content } = req.body;

    try {
        const checkResult = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
        const post = checkResult.rows[0];
        
        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.user_id !== userId) return res.status(403).json({ error: 'Unauthorized' });

        await pool.query('UPDATE posts SET content = $1, is_edited = 1 WHERE id = $2', [content, postId]);
        
        res.json({ message: 'Post updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a post
router.delete('/:id', authenticateToken, async (req, res) => {
    const postId = req.params.id;
    const userId = req.user.id;

    try {
        const checkResult = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
        const post = checkResult.rows[0];
        
        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.user_id !== userId) return res.status(403).json({ error: 'Unauthorized' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM votes WHERE post_id = $1', [postId]);
            await client.query('DELETE FROM comments WHERE post_id = $1', [postId]);
            await client.query('DELETE FROM post_awards WHERE post_id = $1', [postId]);
            await client.query('DELETE FROM posts WHERE id = $1', [postId]);
            await client.query('COMMIT');
            res.json({ message: 'Post deleted' });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
