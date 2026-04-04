// Viewer Screen Share Controller — WebRTC Edition
const API_BASE = window.location.origin;
const WS_BASE = API_BASE.replace('http', 'ws');

let currentSession = null;
let ws = null;
let joinRequestStatus = 'none';
let isMicMuted = true;
let audioStream = null;
let peerConnection = null;

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

const elements = {
    sessionsList: document.getElementById('sessionsList'),
    sessionsContainer: document.getElementById('sessionsContainer'),
    viewerInterface: document.getElementById('viewerInterface'),
    adminName: document.getElementById('adminName'),
    currentSessionId: document.getElementById('currentSessionId'),
    leaveBtn: document.getElementById('leaveBtn'),
    screenCanvas: document.getElementById('screenCanvas'),
    screenContainer: document.getElementById('screenContainer'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    micBtn: document.getElementById('micBtn'),
    waitingMessage: document.getElementById('waitingMessage'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    sendChatBtn: document.getElementById('sendChatBtn'),
    emojiBtn: document.getElementById('emojiBtn'),
    emojiPicker: document.getElementById('emojiPicker'),
    infoAdminName: document.getElementById('infoAdminName'),
    startedAt: document.getElementById('startedAt'),
    viewerCount: document.getElementById('viewerCount')
};

function getToken() { return localStorage.getItem('token'); }

function getCurrentUserId() {
    const token = getToken();
    if (!token) return null;
    try {
        const payload = token.split('.')[1];
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(atob(base64).split('').map(c =>
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join(''));
        return JSON.parse(json).user_id || null;
    } catch (e) { return null; }
}

function showNotification(message, type) {
    type = type || 'info';
    var colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500', warning: 'bg-yellow-500' };
    var icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle', warning: 'exclamation-triangle' };
    var notification = document.createElement('div');
    notification.className = 'notification fixed top-4 right-4 ' + (colors[type] || 'bg-blue-500') + ' text-white px-6 py-3 rounded-lg shadow-lg z-50';
    notification.innerHTML = '<i class="fas fa-' + (icons[type] || 'info-circle') + ' mr-2"></i>' + message;
    document.body.appendChild(notification);
    setTimeout(function() { notification.style.opacity = '0'; setTimeout(function() { notification.remove(); }, 300); }, 4000);
}

// ── WebRTC ─────────────────────────────────────────────────────────────
function createViewerPeerConnection() {
    if (peerConnection) { peerConnection.close(); }
    peerConnection = new RTCPeerConnection(ICE_SERVERS);

    peerConnection.ontrack = function(event) {
        console.log('[WebRTC] Got remote track:', event.track.kind);
        showRemoteStream(event.streams[0]);
    };

    peerConnection.onicecandidate = function(event) {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'webrtc_ice', candidate: event.candidate }));
        }
    };

    peerConnection.onconnectionstatechange = function() {
        console.log('[WebRTC] State:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            showNotification('Stream connected!', 'success');
        } else if (peerConnection.connectionState === 'failed') {
            showNotification('Stream failed. Retrying...', 'error');
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'viewer_ready' }));
            }
        }
    };

    return peerConnection;
}

async function handleOffer(sdp) {
    var pc = createViewerPeerConnection();
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        var answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'webrtc_answer', sdp: pc.localDescription }));
        }
    } catch (e) {
        console.error('[WebRTC] Error handling offer:', e);
    }
}

async function handleAdminICE(candidate) {
    if (!peerConnection) return;
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
        console.error('[WebRTC] ICE error:', e);
    }
}

function showRemoteStream(stream) {
    var videoEl = document.getElementById('remoteVideo');
    if (!videoEl) {
        videoEl = document.createElement('video');
        videoEl.id = 'remoteVideo';
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.style.cssText = 'width:100%;height:auto;display:block;border-radius:8px;';
        elements.screenContainer.appendChild(videoEl);
        elements.screenCanvas.style.display = 'none';
    }
    videoEl.srcObject = stream;
    elements.waitingMessage.style.display = 'none';
    videoEl.style.display = 'block';
}

// ── Sessions ───────────────────────────────────────────────────────────
async function loadActiveSessions() {
    try {
        var res = await fetch(API_BASE + '/api/screenshare/sessions', {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        var data = await res.json();
        var userRes = await fetch(API_BASE + '/api/user/profile', {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        var userData = await userRes.json();
        var currentUserId = userData.user && userData.user.id;

        var activeSessions = (data.sessions || [])
            .filter(function(s) { return s.is_active && s.admin_id !== currentUserId; })
            .reduce(function(acc, session) {
                var existing = acc.find(function(s) { return s.admin_id === session.admin_id; });
                if (!existing || new Date(session.started_at) > new Date(existing.started_at)) {
                    return acc.filter(function(s) { return s.admin_id !== session.admin_id; }).concat([session]);
                }
                return acc;
            }, []);

        displaySessions(activeSessions);
    } catch (e) {
        console.error('Error loading sessions:', e);
        showNotification('Failed to load sessions', 'error');
    }
}

function displaySessions(sessions) {
    elements.sessionsContainer.innerHTML = '';
    if (!sessions.length) {
        elements.sessionsContainer.innerHTML = '<div class="col-span-full text-center py-16"><i class="fas fa-video-slash text-6xl text-slate-600 mb-4"></i><h3 class="text-xl font-semibold text-slate-400 mb-2">No Live Sessions</h3><p class="text-slate-500">Check back later for live trading sessions</p></div>';
        return;
    }
    sessions.forEach(function(session, index) {
        var card = document.createElement('div');
        card.className = 'session-card glass rounded-xl p-6';
        card.style.animationDelay = (index * 0.1) + 's';
        card.innerHTML = '<div class="flex items-start justify-between mb-4"><div class="flex items-center space-x-3"><div class="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center"><i class="fas fa-user-tie text-white text-xl"></i></div><div><h3 class="text-lg font-semibold text-white">' + session.admin_name + '</h3><p class="text-sm text-slate-400">Live Trading Session</p></div></div><div class="flex items-center space-x-2"><div class="w-2 h-2 bg-green-500 rounded-full pulse"></div><span class="text-green-400 text-sm font-medium">LIVE</span></div></div><div class="space-y-2 mb-4"><div class="flex items-center text-sm text-slate-400"><i class="fas fa-clock mr-2 text-blue-400"></i>Started ' + new Date(session.started_at).toLocaleString() + '</div><div class="flex items-center text-sm text-slate-400"><i class="fas fa-bolt mr-2 text-yellow-400"></i>WebRTC low-latency stream</div></div><button onclick="requestJoinSession(' + session.id + ')" class="w-full btn-primary py-3 rounded-lg font-medium transition-all shadow-lg hover:shadow-xl"><i class="fas fa-sign-in-alt mr-2"></i>Request to Join</button>';
        elements.sessionsContainer.appendChild(card);
    });
}

async function requestJoinSession(sessionId) {
    try {
        var res = await fetch(API_BASE + '/api/screenshare/join/' + sessionId, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        var data = await res.json();

        if (res.ok) {
            var sessionsRes = await fetch(API_BASE + '/api/screenshare/sessions', {
                headers: { 'Authorization': 'Bearer ' + getToken() }
            });
            var sessionsData = await sessionsRes.json();
            currentSession = (sessionsData.sessions || []).find(function(s) { return s.id === sessionId; });

            if (currentSession) {
                joinRequestStatus = data.auto_approved ? 'approved' : 'pending';
                localStorage.setItem('activeScreenShareSession', JSON.stringify({
                    sessionId: sessionId, status: joinRequestStatus, session: currentSession
                }));
                showWaitingForApproval();
                connectWebSocket(sessionId);
                if (data.auto_approved) {
                    setApprovedUI();
                    setTimeout(function() {
                        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'viewer_ready' }));
                    }, 500);
                } else {
                    showNotification('Join request sent! Waiting for admin approval...', 'success');
                }
            }
        } else {
            showNotification(data.error || data.message || 'Failed to send request', 'error');
        }
    } catch (e) {
        console.error('Error requesting to join:', e);
        showNotification('Failed to send join request', 'error');
    }
}

function showWaitingForApproval() {
    elements.sessionsList.classList.add('hidden');
    elements.viewerInterface.classList.remove('hidden');
    elements.adminName.textContent = currentSession.admin_name;
    elements.currentSessionId.textContent = currentSession.id;
    elements.infoAdminName.textContent = currentSession.admin_name;
    elements.startedAt.textContent = new Date(currentSession.started_at).toLocaleString();
    elements.waitingMessage.innerHTML = '<i class="fas fa-hourglass-half text-6xl mb-4 text-yellow-500"></i><p class="text-lg text-yellow-400">Waiting for Admin Approval...</p><p class="text-sm text-slate-400 mt-2">The admin will review your request shortly</p>';
}

function setApprovedUI() {
    elements.waitingMessage.innerHTML = '<i class="fas fa-satellite-dish text-6xl mb-4 text-blue-400 pulse"></i><p class="text-lg text-blue-400">Connecting stream...</p><p class="text-sm text-slate-400 mt-2">WebRTC peer connection establishing</p>';
    elements.micBtn.classList.remove('hidden');
    startAudioCapture();
}

// ── WebSocket ──────────────────────────────────────────────────────────
function connectWebSocket(sessionId) {
    ws = new WebSocket(WS_BASE + '/ws/screenshare?session_id=' + sessionId + '&token=' + getToken());

    ws.onopen = function() { console.log('Connected to session WS'); };

    ws.onmessage = function(event) {
        var msg = JSON.parse(event.data);
        handleWebSocketMessage(msg);
    };

    ws.onerror = function(e) { console.error('WebSocket error:', e); };

    ws.onclose = function() {
        if (joinRequestStatus === 'approved' && currentSession) {
            showNotification('Connection lost. Reconnecting...', 'info');
            setTimeout(function() { connectWebSocket(currentSession.id); }, 2000);
        }
    };
}

function handleWebSocketMessage(msg) {
    switch (msg.type) {
        case 'join_response':
            if (msg.data === 'approved') {
                joinRequestStatus = 'approved';
                var saved = JSON.parse(localStorage.getItem('activeScreenShareSession') || '{}');
                if (saved.sessionId) { saved.status = 'approved'; localStorage.setItem('activeScreenShareSession', JSON.stringify(saved)); }
                showNotification('Access granted!', 'success');
                setApprovedUI();
                setTimeout(function() {
                    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'viewer_ready' }));
                }, 300);
            } else if (msg.data === 'rejected') {
                joinRequestStatus = 'rejected';
                localStorage.removeItem('activeScreenShareSession');
                showNotification('Your request was declined', 'error');
                elements.waitingMessage.innerHTML = '<i class="fas fa-times-circle text-6xl mb-4 text-red-500"></i><p class="text-lg text-red-400">Request Declined</p>';
                setTimeout(leaveSession, 2000);
            }
            break;

        case 'webrtc_offer':
            if (joinRequestStatus === 'approved') handleOffer(msg.sdp);
            break;

        case 'webrtc_ice':
            if (joinRequestStatus === 'approved') handleAdminICE(msg.candidate);
            break;

        case 'chat':
            if (joinRequestStatus === 'approved' && msg.user_id !== getCurrentUserId()) {
                addChatMessage(msg.message, 'user', msg.username);
            }
            break;

        case 'session_ended':
            localStorage.removeItem('activeScreenShareSession');
            showNotification('Admin ended the session', 'warning');
            setTimeout(leaveSession, 2000);
            break;

        case 'screen_data':
            if (joinRequestStatus === 'approved') displayScreenFrame(msg.data);
            break;
    }
}

function displayScreenFrame(frameData) {
    elements.waitingMessage.style.display = 'none';
    elements.screenCanvas.style.display = 'block';
    var img = new Image();
    img.onload = function() {
        var ctx = elements.screenCanvas.getContext('2d');
        elements.screenCanvas.width = img.width;
        elements.screenCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);
    };
    img.src = frameData;
}

function leaveSession() {
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (ws) { ws.close(); ws = null; }
    localStorage.removeItem('activeScreenShareSession');
    currentSession = null;
    joinRequestStatus = 'none';
    elements.viewerInterface.classList.add('hidden');
    elements.sessionsList.classList.remove('hidden');
    elements.waitingMessage.style.display = 'flex';
    elements.screenCanvas.style.display = 'none';
    var remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) remoteVideo.remove();
    elements.chatMessages.innerHTML = '';
    loadActiveSessions();
}

// ── Chat ───────────────────────────────────────────────────────────────
function sendChat() {
    var message = elements.chatInput.value.trim();
    if (!message || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (joinRequestStatus !== 'approved') { showNotification('Wait for admin approval to chat', 'warning'); return; }
    ws.send(JSON.stringify({ type: 'chat', message: message }));
    addChatMessage(message, 'user', 'You');
    elements.chatInput.value = '';
}

function addChatMessage(message, type, username) {
    type = type || 'user';
    username = username || 'You';
    var div = document.createElement('div');
    div.className = 'chat-message';
    if (type === 'system') {
        div.className += ' text-center text-slate-500 text-sm py-2';
        div.innerHTML = '<i class="fas fa-info-circle mr-1"></i>' + message;
    } else {
        var isMe = username === 'You';
        div.className += ' ' + (isMe ? 'bg-gradient-to-r from-blue-500/20 to-blue-600/20 border border-blue-500/30' : 'bg-gradient-to-r from-slate-800/50 to-slate-700/50 border border-slate-600/30') + ' rounded-lg p-3';
        div.innerHTML = '<div class="flex items-start gap-2"><div class="w-8 h-8 rounded-full ' + (isMe ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-gradient-to-br from-purple-500 to-purple-600') + ' flex items-center justify-center text-xs font-semibold flex-shrink-0">' + username.charAt(0).toUpperCase() + '</div><div class="flex-1"><p class="text-xs ' + (isMe ? 'text-blue-400' : 'text-purple-400') + ' font-medium mb-1">' + username + '</p><p class="text-white text-sm break-words">' + escapeHtml(message) + '</p></div></div>';
    }
    elements.chatMessages.appendChild(div);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── Audio ──────────────────────────────────────────────────────────────
async function startAudioCapture() {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        updateMicButton();
    } catch (e) { console.warn('Mic access denied:', e); }
}

function toggleMic() {
    isMicMuted = !isMicMuted;
    if (audioStream) audioStream.getAudioTracks().forEach(function(t) { t.enabled = !isMicMuted; });
    updateMicButton();
    showNotification(isMicMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
}

function updateMicButton() {
    if (isMicMuted) {
        elements.micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        elements.micBtn.classList.add('bg-red-500/20', 'text-red-400');
        elements.micBtn.classList.remove('bg-green-500/20', 'text-green-400', 'mic-active');
    } else {
        elements.micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        elements.micBtn.classList.add('bg-green-500/20', 'text-green-400', 'mic-active');
        elements.micBtn.classList.remove('bg-red-500/20', 'text-red-400');
    }
}

// ── Emoji ──────────────────────────────────────────────────────────────
var emojis = ['😀','😂','😍','🎉','👍','👏','🔥','💯','✅','❤️','🚀','💰','📈','📉','💪','🙏','👀','🤔','😎','🎯','⚡','💡','🌟','✨'];

function initEmojiPicker() {
    emojis.forEach(function(emoji) {
        var btn = document.createElement('span');
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.onclick = function() { elements.chatInput.value += emoji; elements.chatInput.focus(); elements.emojiPicker.classList.add('hidden'); };
        elements.emojiPicker.appendChild(btn);
    });
}

elements.emojiBtn.addEventListener('click', function(e) { e.stopPropagation(); elements.emojiPicker.classList.toggle('hidden'); });
document.addEventListener('click', function(e) { if (!elements.emojiPicker.contains(e.target) && e.target !== elements.emojiBtn) elements.emojiPicker.classList.add('hidden'); });

// ── Fullscreen ─────────────────────────────────────────────────────────
elements.fullscreenBtn.addEventListener('click', function() {
    var container = elements.screenContainer;
    if (!document.fullscreenElement) {
        var req = container.requestFullscreen || container.webkitRequestFullscreen || container.mozRequestFullScreen;
        if (req) req.call(container);
        elements.fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
    } else {
        var exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
        if (exit) exit.call(document);
        elements.fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    }
});
document.addEventListener('fullscreenchange', function() { if (!document.fullscreenElement) elements.fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>'; });

// ── Event listeners ────────────────────────────────────────────────────
elements.leaveBtn.addEventListener('click', leaveSession);
elements.sendChatBtn.addEventListener('click', sendChat);
elements.chatInput.addEventListener('keypress', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
elements.micBtn.addEventListener('click', toggleMic);

window.requestJoinSession = requestJoinSession;
window.loadActiveSessions = loadActiveSessions;

// ── Init ───────────────────────────────────────────────────────────────
if (!getToken()) {
    showNotification('Please login first', 'error');
    setTimeout(function() { window.location.href = '/auth'; }, 2000);
} else {
    initEmojiPicker();

    fetch(API_BASE + '/api/user/profile', { headers: { 'Authorization': 'Bearer ' + getToken() } })
        .then(function(r) { return r.json(); })
        .then(function(d) { if (d.user && d.user.id) localStorage.setItem('user_id', d.user.id); });

    var saved = localStorage.getItem('activeScreenShareSession');
    if (saved) {
        try {
            var sessionData = JSON.parse(saved);
            currentSession = sessionData.session;
            joinRequestStatus = sessionData.status;
            fetch(API_BASE + '/api/screenshare/sessions', { headers: { 'Authorization': 'Bearer ' + getToken() } })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    var active = (data.sessions || []).find(function(s) { return s.id === sessionData.sessionId && s.is_active; });
                    if (active) {
                        showNotification('Reconnecting to session...', 'info');
                        showWaitingForApproval();
                        connectWebSocket(sessionData.sessionId);
                        if (sessionData.status === 'approved') {
                            setApprovedUI();
                            setTimeout(function() { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'viewer_ready' })); }, 500);
                        }
                    } else {
                        localStorage.removeItem('activeScreenShareSession');
                        loadActiveSessions();
                    }
                })
                .catch(function() { localStorage.removeItem('activeScreenShareSession'); loadActiveSessions(); });
        } catch (e) { localStorage.removeItem('activeScreenShareSession'); loadActiveSessions(); }
    } else {
        loadActiveSessions();
    }

    setInterval(loadActiveSessions, 10000);
}
