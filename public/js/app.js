const API_URL = window.location.origin + '/api';
let currentUser = null;
let currentChatUserId = null;
let socket = null;

// Auth Check
async function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (window.location.pathname.includes('login.html')) {
        if (token && user) {
            window.location.href = 'index.html';
        }
        return;
    }

    if (!token || !user) {
        window.location.href = 'login.html';
        return;
    }

    // Load full user data including Karma
    await loadCurrentUser();

    // Initialize Socket.io
    initSocket();
    
    // Load Posts if on index
    if (document.getElementById('postsContainer')) {
        loadPosts();
    }
}

async function loadCurrentUser() {
    try {
        const res = await fetch(`${API_URL}/auth/me`, { headers: authHeaders() });
        if (res.ok) {
            currentUser = await res.json();
            const navUsername = document.getElementById('navUsername');
            const karmaScore = document.getElementById('karmaScore');
            const navAvatar = document.getElementById('navAvatar');
            const indexAvatarImg = document.getElementById('indexAvatarImg');
            const indexAvatar = document.getElementById('indexAvatar');
            const navProfileLink = document.getElementById('navProfileLink');

            if (navProfileLink) navProfileLink.href = `profile.html?user=${currentUser.username}`;
            if (navUsername) navUsername.innerText = currentUser.username;
            if (karmaScore) karmaScore.innerText = currentUser.karma;
            
            if (currentUser.avatar_url) {
                if (navAvatar) {
                    navAvatar.src = currentUser.avatar_url;
                    navAvatar.style.display = 'inline-block';
                }
                if (indexAvatarImg) {
                    indexAvatarImg.src = currentUser.avatar_url;
                    indexAvatarImg.style.display = 'inline-block';
                    if (indexAvatar) indexAvatar.style.display = 'none';
                }
            } else {
                if (indexAvatar) indexAvatar.innerText = currentUser.username.charAt(0).toUpperCase();
            }
        }
    } catch (err) {
        console.error(err);
    }
}

function initSocket() {
    if (typeof io !== 'undefined') {
        socket = io();
        socket.emit('join', currentUser.id);

        socket.on('receive_message', (data) => {
            if (currentChatUserId == data.senderId) {
                appendMessage(data.content, 'received');
                scrollToBottom();
            } else {
                // Show notification badge or similar (simplified for now)
                alert('Yeni mesaj: ' + data.content);
            }
        });
    }
}

function authHeaders() {
    return {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    };
}

// ==========================================
// LOGIN & REGISTER
// ==========================================
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authAlert = document.getElementById('authAlert');

function showAuthAlert(message, type = 'danger') {
    authAlert.className = `alert alert-${type} mt-3`;
    authAlert.innerText = message;
    authAlert.classList.remove('d-none');
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                window.location.href = 'index.html';
            } else {
                showAuthAlert(data.error);
            }
        } catch (err) {
            showAuthAlert('Bağlantı hatası');
        }
    });
}

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUsername').value;
        const password = document.getElementById('regPassword').value;

        try {
            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                showAuthAlert('Kayıt başarılı! Giriş yapabilirsiniz.', 'success');
                document.getElementById('login-tab').click(); // switch to login
            } else {
                showAuthAlert(data.error);
            }
        } catch (err) {
            showAuthAlert('Bağlantı hatası');
        }
    });
}

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    });
}

// ==========================================
// POSTS (FEED)
// ==========================================

async function loadPosts() {
    const container = document.getElementById('postsContainer');
    if (!container) return;

    try {
        const res = await fetch(`${API_URL}/posts`, { headers: authHeaders() });
        const posts = await res.json();
        
        if (posts.length === 0) {
            container.innerHTML = '<div class="text-center text-muted p-5">Henüz gönderi yok. İlk paylaşan sen ol!</div>';
            return;
        }

        container.innerHTML = posts.map(post => {
            const date = new Date(post.created_at).toLocaleString('tr-TR');
            const initial = post.username.charAt(0).toUpperCase();
            
            let mediaHtml = '';
            if (post.media_url) {
                let urls = [];
                try {
                    urls = JSON.parse(post.media_url);
                } catch(e) {
                    urls = [post.media_url]; // legacy support
                }
                
                if (post.type === 'image') {
                    mediaHtml = '<div class="d-flex flex-wrap gap-2 mt-2">' + urls.map(url => `
                        <a href="${url}" target="_blank">
                            <img src="${url}" class="post-media shadow-sm" style="max-height: 250px; width: auto; max-width: 100%; object-fit: cover; border-radius: 8px;" loading="lazy">
                        </a>`).join('') + '</div>';
                } else if (post.type === 'video') {
                    mediaHtml = urls.map(url => `<video src="${url}" class="post-media mb-2 w-100 shadow-sm" style="border-radius: 8px;" controls></video>`).join('');
                }
            }

            const isOwner = currentUser && currentUser.username === post.username;
            let optionsHtml = '';
            if (isOwner) {
                optionsHtml = `
                    <div class="dropdown" onclick="event.stopPropagation()">
                        <button class="btn btn-sm text-muted" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                            <li><a class="dropdown-item" href="create.html?edit=${post.id}"><i class="bi bi-pencil me-2"></i> Düzenle</a></li>
                            <li><button class="dropdown-item text-danger" onclick="deletePost(${post.id})"><i class="bi bi-trash me-2"></i> Sil</button></li>
                        </ul>
                    </div>
                `;
            }
            const editedHtml = post.is_edited ? '<span class="text-muted small fst-italic ms-1">(Düzenlendi)</span>' : '';

            return `
                <div class="post-card shadow-sm cursor-pointer" onclick="window.location.href='post.html?id=${post.id}'" style="cursor: pointer;">
                    <div class="post-header w-100">
                        ${post.avatar_url ? `<img src="${post.avatar_url}" class="post-avatar" style="object-fit: cover;">` : `<div class="post-avatar">${initial}</div>`}
                        <div class="post-meta d-flex justify-content-between w-100">
                            <div>
                                <span class="username cursor-pointer" onclick="event.stopPropagation(); window.location.href='profile.html?user=${post.username}'" style="cursor:pointer;">${post.username}</span>
                                <span class="time">${date} ${editedHtml}</span>
                            </div>
                            ${optionsHtml}
                        </div>
                    </div>
                    <!-- Using snippet for feed to avoid massive rich text -->
                    <div class="post-content mt-2 text-truncate" style="max-height: 100px; overflow: hidden;">${post.content || ''}</div>
                    ${mediaHtml}
                    <div class="post-footer d-flex justify-content-between align-items-center">
                        <div class="vote-controls" onclick="event.stopPropagation()">
                            <button class="vote-btn upvote" onclick="votePost(${post.id}, 1)"><i class="bi bi-arrow-up-circle"></i></button>
                            <span class="vote-score">${post.score}</span>
                            <button class="vote-btn downvote" onclick="votePost(${post.id}, -1)"><i class="bi bi-arrow-down-circle"></i></button>
                        </div>
                        <div class="text-muted small">
                            <span class="me-3"><i class="bi bi-gift"></i> ${post.award_count || 0}</span>
                            <span><i class="bi bi-chat-text"></i> ${post.comment_count || 0} Yorum</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Gönderiler yüklenirken hata oluştu.</div>';
    }
}

async function votePost(postId, voteType) {
    try {
        await fetch(`${API_URL}/posts/${postId}/vote`, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ voteType })
        });
        loadPosts(); // lazy reload, real app might just update DOM
    } catch (err) {
        console.error(err);
    }
}

async function deletePost(id) {
    if (!confirm('Bu gönderiyi silmek istediğinize emin misiniz?')) return;
    try {
        const res = await fetch(`${API_URL}/posts/${id}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        if (res.ok) {
            if (window.location.pathname.includes('post.html')) {
                window.location.href = 'index.html';
            } else {
                if (typeof loadPosts === 'function' && document.getElementById('postsContainer')) loadPosts();
                if (typeof loadProfile === 'function' && document.getElementById('userPostsContainer')) loadProfile();
            }
        } else {
            alert('Silme işlemi başarısız.');
        }
    } catch (err) {
        console.error(err);
    }
}

// (Removed inline comments logic as they are now on post.html)

// ==========================================
// DM (Direct Messages)
// ==========================================
const dmModal = document.getElementById('dmModal');
if (dmModal) {
    dmModal.addEventListener('show.bs.modal', async () => {
        loadDmUsers();
    });
}

async function loadDmUsers() {
    const list = document.getElementById('dmUsersList');
    try {
        const res = await fetch(`${API_URL}/dm/users`, { headers: authHeaders() });
        const users = await res.json();
        
        list.innerHTML = users.map(u => `
            <button class="list-group-item list-group-item-action border-0 rounded-3 mb-1" onclick="openChat(${u.id}, '${u.username}')">
                <div class="d-flex align-items-center">
                    <div class="post-avatar mb-0 me-2" style="width:30px;height:30px;font-size:0.8rem;">${u.username.charAt(0).toUpperCase()}</div>
                    ${u.username}
                </div>
            </button>
        `).join('');
    } catch (err) {
        list.innerHTML = '<div class="small text-danger">Kullanıcılar yüklenemedi.</div>';
    }
}

async function openChat(userId, username) {
    currentChatUserId = userId;
    const header = document.getElementById('chatHeader');
    const messagesDiv = document.getElementById('chatMessages');
    const form = document.getElementById('dmForm');
    
    header.innerText = username;
    header.classList.remove('d-none');
    form.classList.remove('d-none');
    messagesDiv.innerHTML = '<div class="text-center small text-muted mt-5">Yükleniyor...</div>';

    try {
        const res = await fetch(`${API_URL}/dm/history/${userId}`, { headers: authHeaders() });
        const messages = await res.json();
        
        messagesDiv.innerHTML = '';
        messages.forEach(m => {
            const type = m.sender_id === currentUser.id ? 'sent' : 'received';
            appendMessage(m.content, type);
        });
        scrollToBottom();
    } catch (err) {
        messagesDiv.innerHTML = '<div class="text-danger small text-center mt-5">Geçmiş yüklenemedi.</div>';
    }
}

function appendMessage(content, type) {
    const div = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message-bubble ${type}`;
    msgDiv.innerText = content;
    
    // Add flex wrapper to align properly
    const wrapper = document.createElement('div');
    wrapper.className = `d-flex flex-column ${type === 'sent' ? 'align-items-end' : 'align-items-start'}`;
    wrapper.appendChild(msgDiv);
    
    div.appendChild(wrapper);
}

function scrollToBottom() {
    const div = document.getElementById('chatMessages');
    div.scrollTop = div.scrollHeight;
}

const dmForm = document.getElementById('dmForm');
if (dmForm) {
    dmForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('dmInput');
        const content = input.value.trim();
        if (!content || !currentChatUserId) return;

        // Optimistic UI
        appendMessage(content, 'sent');
        scrollToBottom();
        input.value = '';

        // Send via API to save to DB
        try {
            await fetch(`${API_URL}/dm/send`, {
                method: 'POST',
                headers: {
                    ...authHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ receiverId: currentChatUserId, content })
            });

            // Emit socket event for real-time delivery
            if (socket) {
                socket.emit('private_message', {
                    senderId: currentUser.id,
                    receiverId: currentChatUserId,
                    content: content
                });
            }
        } catch (err) {
            console.error('Failed to send message', err);
        }
    });
}

// Run auth check on load
checkAuth();
