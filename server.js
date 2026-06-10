const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

require('dotenv').config();

// Initialize DB
const { initDb } = require('./db/database');
initDb();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Routes (We'll implement these next)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/dm', require('./routes/dm'));

// Socket.io for Real-time Messaging
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Users can join their own room (their user_id) to receive private messages
    socket.on('join', (userId) => {
        socket.join(userId);
        console.log(`User ${userId} joined their room.`);
    });

    socket.on('private_message', (data) => {
        // data: { senderId, receiverId, content }
        // Broadcast to the receiver's room
        io.to(data.receiverId).emit('receive_message', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
