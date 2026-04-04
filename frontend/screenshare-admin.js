// Admin Screen Share Controller — WebRTC Edition
const API_BASE = window.location.origin;
const WS_BASE = API_BASE.replace('http', 'ws');

let currentSession = null;
let ws = null;
let mediaStream = null;
let audioStream = null;
let isMicMuted = true;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// WebRTC: one RTCPeerConnection per viewer
const peerConnections = new Map(); // userId -> RTCPeerConnection

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

const elements = {
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    micBtn: document.getElementById('micBtn'),
    sessionStatus: document.getElementById('sessionStatus'),
    screenPreview: document.getElementById('screenPreview'),
    noPreview: document.getElementById('noPreview'),
    participantList: document.getElementById('participantList'),
    participantCount: document.getElementById('participantCount'),
    viewerCount: document.getElementById('viewerCount'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    sendChatBtn: document.getElementById('sendChatBtn')
};

function getToken() {
    return localStorage.getItem('token');
}

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

function showNotification(message, type = 'info') {
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
    const notification = document.createElement('div');
    notification.className = `notification fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50`;
    notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i>${message}`;
    document.body.appendChild(notification);
    setTimeout(() => { notification.style.opacity = '0'; setTimeout(() => notification.remove(), 300); }, 3000);
}

// ── WebRTC: create a peer connection for a new viewer ──────────────────
async function createPeerConnection(viewerId) {
    if (peerConnections.has(viewerId)) {
        peerConnections.get(viewerId).close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.set(viewerId, pc);

    // Add all tracks from the media stream
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => pc.addTrack(track, mediaStream));
    }
    if (audioStream && !isMicMuted) {
        audioStream.getTracks().forEach(track => pc.addTrack(track, audioStream));
    }

    // Send ICE candidates to viewer via WebSocket signaling
    pc.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'webrtc_ice',
                target_user_id: viewerId,
                candidate: event.candidate
            }));
        }
    };

    pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Peer ${viewerId} state: ${pc.connectionState}`);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            peerConnections.delete(viewerId);
        }
    };

    // Create and send offer
    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await pc.setLocalDescription(offer);

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'webrtc_offer',
            target_user_id: viewerId,
            sdp: pc.localDescription
        }));
    }

    return pc;
}

// ── Handle WebRTC answer from viewer ──────────────────────────────────
async function handleWebRTCAnswer(viewerId, sdp) {
    const pc = peerConnections.get(viewerId);
    if (!pc) return;
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (e) {
        console.error('[WebRTC] Error setting remote description:', e);
    }
}

// ── Handle ICE candidate from viewer ──────────────────────────────────
async function handleViewerICE(viewerId, candidate) {
    const pc = peerConnections.get(viewerId);
    if (!pc) return;
    try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
        console.error('[WebRTC] Error adding ICE candidate:', e);
    }
}

// ── Session management ─────────────────────────────────────────────────
async function startSession() {
    elements.startBtn.disabled = true;
    elements.startBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Starting...';

    try {
        if (currentSession) {
            await startScreenCapture();
            updateUI(true);
            showNotification('Streaming resumed!', 'success');
            return;
        }

        const response = await fetch(`${API_BASE}/api/admin/screenshare/start`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        if (response.ok) {
            currentSession = data.session;
            localStorage.setItem('activeScreenShareSession', JSON.stringify(currentSession));
            await startScreenCapture();
            connectWebSocket();
            updateUI(true);
            showNotification('Screen sharing started!', 'success');
        } else {
            showNotification(data.error || 'Failed to start session', 'error');
            elements.startBtn.disabled = false;
            elements.startBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Start Screen Share';
        }
    } catch (error) {
        console.error('Error starting session:', error);
        showNotification('Failed to start session', 'error');
        elements.startBtn.disabled = false;
        elements.startBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Start Screen Share';
    }
}

async function startScreenCapture() {
    try {
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        if (isMobile) {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            showNotification('Using camera (screen share not supported on mobile)', 'info');
        } else {
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: { mediaSource: 'screen', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
                audio: true  // capture system audio if available
            });
        }

        // Show local preview
        elements.screenPreview.srcObject = mediaStream;
        elements.noPreview.style.display = 'none';
        elements.screenPreview.style.display = 'block';
        elements.micBtn.classList.remove('hidden');

        // Start mic capture separately
        await startAudioCapture();

        // When user stops sharing via browser UI
        mediaStream.getVideoTracks()[0].onended = () => {
            showNotification('Stream stopped', 'info');
            stopSession();
        };
    } catch (error) {
        console.error('Error capturing screen:', error);
        if (error.name === 'NotAllowedError') {
            showNotification('Permission denied. Please allow screen/camera access.', 'error');
        } else {
            showNotification('Failed to start stream: ' + error.message, 'error');
        }
        if (currentSession) stopSession();
    }
}

async function stopSession() {
    if (!currentSession) return;

    // Close all peer connections
    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();

    try {
        await fetch(`${API_BASE}/api/admin/screenshare/stop/${currentSession.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
    } catch (e) { console.error('Error stopping session:', e); }

    localStorage.removeItem('activeScreenShareSession');

    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); audioStream = null; }
    if (ws) { ws.close(); ws = null; }

    elements.screenPreview.srcObject = null;
    elements.screenPreview.style.display = 'none';
    elements.noPreview.style.display = 'flex';
    elements.micBtn.classList.add('hidden');
    isMicMuted = true;
    currentSession = null;
    updateUI(false);
    clearParticipants();
    showNotification('Session stopped', 'info');
}

// ── WebSocket signaling ────────────────────────────────────────────────
function connectWebSocket() {
    if (!currentSession) return;
    ws = new WebSocket(`${WS_BASE}/ws/screenshare?session_id=${currentSession.id}&token=${getToken()}`);

    ws.onopen = () => {
        reconnectAttempts = 0;
        showNotification('Connected to session', 'success');
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleWebSocketMessage(msg);
    };

    ws.onerror = (e) => console.error('WebSocket error:', e);

    ws.onclose = () => {
        if (currentSession && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            showNotification(`Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'info');
            setTimeout(connectWebSocket, 2000);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            showNotification('Failed to reconnect. Please refresh.', 'error');
        }
    };
}

function handleWebSocketMessage(msg) {
    switch (msg.type) {
        case 'admin_connected':
            console.log('Admin connected');
            break;

        case 'join_request':
            showJoinRequest(msg);
            break;

        case 'user_joined':
            addParticipant(msg);
            addChatMessage(`${msg.username} joined the session`, 'system');
            showNotification(`${msg.username} joined`, 'info');
            // Start WebRTC for this viewer
            createPeerConnection(msg.user_id);
            break;

        case 'user_left':
            removeParticipant(msg.user_id);
            addChatMessage(`${msg.username} left the session`, 'system');
            if (peerConnections.has(msg.user_id)) {
                peerConnections.get(msg.user_id).close();
                peerConnections.delete(msg.user_id);
            }
            break;

        case 'webrtc_answer':
            handleWebRTCAnswer(msg.from_user_id, msg.sdp);
            break;

        case 'webrtc_ice':
            handleViewerICE(msg.from_user_id, msg.candidate);
            break;

        case 'viewer_ready':
            // Viewer is ready to receive — send them an offer
            createPeerConnection(msg.user_id);
            break;

        case 'chat':
            if (msg.user_id !== getCurrentUserId()) {
                addChatMessage(msg.message, 'user', msg.username);
            }
            break;
    }
}

// ── UI helpers ─────────────────────────────────────────────────────────
function updateUI(isActive) {
    if (isActive) {
        elements.startBtn.classList.add('hidden');
        elements.stopBtn.classList.remove('hidden');
        elements.sessionStatus.innerHTML = '<i class="fas fa-circle mr-2 text-green-500 pulse"></i>Live';
        elements.sessionStatus.className = 'px-4 py-2 rounded-full text-sm font-medium bg-green-500/20 text-green-400';
    } else {
        elements.startBtn.classList.remove('hidden');
        elements.stopBtn.classList.add('hidden');
        elements.startBtn.disabled = false;
        elements.startBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Start Screen Share';
        elements.sessionStatus.innerHTML = '<i class="fas fa-circle mr-2"></i>Not Started';
        elements.sessionStatus.className = 'px-4 py-2 rounded-full text-sm font-medium bg-slate-700 text-slate-300';
    }
}

function addParticipant(participant) {
    if (elements.participantList.querySelector('.text-slate-500')) elements.participantList.innerHTML = '';
    const div = document.createElement('div');
    div.id = `participant-${participant.user_id}`;
    div.className = 'participant-item flex items-center gap-3 p-3 rounded-lg bg-slate-800/50';
    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-semibold">
            ${participant.username.charAt(0).toUpperCase()}
        </div>
        <div class="flex-1">
            <p class="font-medium text-white">${participant.username}</p>
            <p class="text-xs text-slate-400">${new Date(participant.timestamp).toLocaleTimeString()}</p>
        </div>
        <div class="w-2 h-2 bg-green-500 rounded-full pulse"></div>`;
    elements.participantList.appendChild(div);
    updateParticipantCount();
}

function removeParticipant(userId) {
    const elem = document.getElementById(`participant-${userId}`);
    if (elem) { elem.style.opacity = '0'; setTimeout(() => elem.remove(), 300); }
    updateParticipantCount();
}

function clearParticipants() {
    elements.participantList.innerHTML = `<div class="text-center py-8 text-slate-500"><i class="fas fa-user-friends text-3xl mb-2 opacity-50"></i><p class="text-sm">No participants yet</p></div>`;
    updateParticipantCount();
}

function updateParticipantCount() {
    const count = elements.participantList.querySelectorAll('.participant-item').length;
    elements.participantCount.textContent = count;
    elements.viewerCount.innerHTML = `<i class="fas fa-eye mr-1"></i>${count} viewer${count !== 1 ? 's' : ''}`;
}

function sendChat() {
    const message = elements.chatInput.value.trim();
    if (!message || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'chat', message }));
    addChatMessage(message, 'admin', 'You');
    elements.chatInput.value = '';
}

function addChatMessage(message, type = 'user', username = 'You') {
    const div = document.createElement('div');
    div.className = 'chat-message';
    if (type === 'system') {
        div.className += ' text-center text-slate-500 text-sm py-2';
        div.innerHTML = `<i class="fas fa-info-circle mr-1"></i>${message}`;
    } else if (type === 'admin') {
        div.className += ' bg-blue-500/20 rounded-lg p-3';
        div.innerHTML = `<div class="flex items-start gap-2"><div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-semibold flex-shrink-0">${username.charAt(0)}</div><div class="flex-1"><p class="text-xs text-blue-400 font-medium mb-1">${username}</p><p class="text-white text-sm">${message}</p></div></div>`;
    } else {
        div.className += ' bg-slate-800/50 rounded-lg p-3';
        div.innerHTML = `<div class="flex items-start gap-2"><div class="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-xs font-semibold flex-shrink-0">${username.charAt(0)}</div><div class="flex-1"><p class="text-xs text-slate-400 font-medium mb-1">${username}</p><p class="text-white text-sm">${message}</p></div></div>`;
    }
    elements.chatMessages.appendChild(div);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function showJoinRequest(msg) {
    const notification = document.createElement('div');
    notification.className = 'fixed top-20 right-4 glass text-white px-6 py-4 rounded-lg shadow-2xl z-50 w-80';
    notification.innerHTML = `
        <div class="flex items-start justify-between mb-3">
            <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-semibold">${msg.username.charAt(0).toUpperCase()}</div>
                <div><p class="font-semibold">${msg.username}</p><p class="text-xs text-slate-400">wants to join</p></div>
            </div>
        </div>
        <div class="flex space-x-2">
            <button onclick="reviewJoinRequest(${msg.data}, 'approved')" class="flex-1 bg-green-500 hover:bg-green-600 py-2 rounded-lg text-sm font-medium transition-colors"><i class="fas fa-check mr-1"></i>Approve</button>
            <button onclick="reviewJoinRequest(${msg.data}, 'rejected')" class="flex-1 bg-red-500 hover:bg-red-600 py-2 rounded-lg text-sm font-medium transition-colors"><i class="fas fa-times mr-1"></i>Decline</button>
        </div>`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 30000);
}

async function reviewJoinRequest(requestId, status) {
    try {
        await fetch(`${API_BASE}/api/screenshare/requests/${requestId}/review`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        showNotification(`Request ${status}`, 'success');
        document.querySelectorAll('.fixed.top-20').forEach(el => el.remove());
    } catch (e) { console.error('Error reviewing request:', e); }
}
window.reviewJoinRequest = reviewJoinRequest;

// ── Audio ──────────────────────────────────────────────────────────────
async function startAudioCapture() {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        updateMicButton();
    } catch (e) {
        console.warn('Mic access denied:', e);
    }
}

function toggleMic() {
    isMicMuted = !isMicMuted;
    // Add/remove mic track from all peer connections
    peerConnections.forEach(pc => {
        const senders = pc.getSenders();
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
        if (audioSender && audioStream) {
            if (isMicMuted) {
                audioSender.track.enabled = false;
            } else {
                audioSender.track.enabled = true;
            }
        }
    });
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

// ── Event listeners ────────────────────────────────────────────────────
elements.startBtn.addEventListener('click', startSession);
elements.stopBtn.addEventListener('click', stopSession);
elements.sendChatBtn.addEventListener('click', sendChat);
elements.chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });
elements.micBtn.addEventListener('click', toggleMic);

// ── Init ───────────────────────────────────────────────────────────────
async function checkActiveSession() {
    const saved = localStorage.getItem('activeScreenShareSession');
    if (!saved) return;
    try {
        const sessionData = JSON.parse(saved);
        const res = await fetch(`${API_BASE}/api/screenshare/sessions`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        const data = await res.json();
        const active = data.sessions?.find(s => s.id === sessionData.id && s.is_active);
        if (active) {
            currentSession = active;
            showNotification('Previous session found. Click "Resume Streaming" to continue.', 'info');
            updateUI(true);
            elements.stopBtn.classList.add('hidden');
            elements.startBtn.classList.remove('hidden');
            elements.startBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Resume Streaming';
            elements.startBtn.disabled = false;
            connectWebSocket();
        } else {
            localStorage.removeItem('activeScreenShareSession');
        }
    } catch (e) {
        localStorage.removeItem('activeScreenShareSession');
    }
}

if (!getToken()) {
    showNotification('Please login first', 'error');
    setTimeout(() => window.location.href = '/auth', 2000);
} else {
    checkActiveSession();
}
