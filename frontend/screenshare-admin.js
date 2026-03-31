// Admin Screen Share Controller
const API_BASE = window.location.origin;
const WS_BASE = API_BASE.replace('http', 'ws');

let currentSession = null;
let ws = null;
let mediaStream = null;
let audioStream = null;
let audioContext = null;
let audioProcessor = null;
let isMicMuted = true;
let canvas = null;
let ctx = null;
let streamInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

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
        // Base64url decode
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(atob(base64).split('').map(c => 
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join(''));
        const decoded = JSON.parse(json);
        return decoded.user_id || decoded.sub;
    } catch (e) {
        console.error('Error decoding token:', e);
        return null;
    }
}

function showNotification(message, type = 'info') {
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
    };
    
    const notification = document.createElement('div');
    notification.className = `notification fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50`;
    notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i>${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

async function startSession() {
    elements.startBtn.disabled = true;
    elements.startBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Starting...';
    
    try {
        // Check if resuming existing session
        if (currentSession) {
            console.log('Resuming existing session:', currentSession.id);
            await startScreenCapture();
            updateUI(true);
            showNotification('Streaming resumed!', 'success');
            return;
        }
        
        // Start new session
        const response = await fetch(`${API_BASE}/api/admin/screenshare/start`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (response.ok) {
            currentSession = data.session;
            console.log('Session started:', currentSession);
            // Save session to localStorage for persistence
            localStorage.setItem('activeScreenShareSession', JSON.stringify(currentSession));
            console.log('Session saved to localStorage');
            await startScreenCapture();
            connectWebSocket();
            updateUI(true);
            showNotification('Screen sharing started successfully!', 'success');
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
            // Mobile: getDisplayMedia is not supported — use camera instead
            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            showNotification('Using camera (screen share not supported on mobile)', 'info');
        } else {
            // Desktop: full screen capture
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: { mediaSource: 'screen', width: 1920, height: 1080 },
                audio: false
            });
        }

        elements.screenPreview.srcObject = mediaStream;
        elements.noPreview.style.display = 'none';
        elements.screenPreview.style.display = 'block';
        elements.micBtn.classList.remove('hidden');

        canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d');

        // Clear any existing interval
        if (streamInterval) {
            clearInterval(streamInterval);
        }
        streamInterval = setInterval(streamFrames, 100);

        // Start audio capture
        await startAudioCapture();

        mediaStream.getVideoTracks()[0].onended = () => {
            showNotification('Stream stopped', 'info');
            stopSession();
        };
    } catch (error) {
        console.error('Error capturing screen:', error);
        if (error.name === 'NotAllowedError') {
            showNotification('Permission denied. Please allow camera/screen access.', 'error');
        } else if (error.name === 'NotSupportedError') {
            showNotification('Screen sharing is not supported on this device.', 'error');
        } else {
            showNotification('Failed to start stream. Please grant permission.', 'error');
        }
        // If resuming and user cancels, stop the session
        if (currentSession) {
            stopSession();
        }
    }
}

function streamFrames() {
    if (!mediaStream || !ws || ws.readyState !== WebSocket.OPEN) return;

    const video = elements.screenPreview;
    if (video.videoWidth === 0) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const frameData = canvas.toDataURL('image/jpeg', 0.7);
    
    ws.send(JSON.stringify({
        type: 'screen_data',
        data: frameData
    }));
}

function connectWebSocket() {
    if (!currentSession) return;
    
    ws = new WebSocket(`${WS_BASE}/ws/screenshare?session_id=${currentSession.id}&token=${getToken()}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        showNotification('Connected to session', 'success');
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleWebSocketMessage(msg);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket closed');
        // Auto-reconnect if session is still active
        if (currentSession && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            showNotification(`Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'info');
            // Notify viewers about reconnection
            setTimeout(() => {
                connectWebSocket();
            }, 2000);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            showNotification('Failed to reconnect. Please refresh the page.', 'error');
        }
    };
}

function handleWebSocketMessage(msg) {
    switch (msg.type) {
        case 'admin_connected':
            console.log('Admin connected successfully');
            break;
        case 'join_request':
            showJoinRequest(msg);
            break;
        case 'user_joined':
            addParticipant(msg);
            addChatMessage(`${msg.username} joined the session`, 'system');
            showNotification(`${msg.username} joined`, 'info');
            break;
        case 'user_left':
            removeParticipant(msg.user_id);
            addChatMessage(`${msg.username} left the session`, 'system');
            break;
        case 'chat':
            if (msg.user_id !== getCurrentUserId()) {
                addChatMessage(msg.message, 'user', msg.username);
            }
            break;
        case 'audio_data':
            console.log('Admin received audio from:', msg.username, 'data length:', msg.data?.length);
            playAudio(msg.data);
            break;
    }
}

async function stopSession() {
    if (!currentSession) return;

    try {
        await fetch(`${API_BASE}/api/admin/screenshare/stop/${currentSession.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
    } catch (error) {
        console.error('Error stopping session:', error);
    }

    // Clear session from localStorage
    localStorage.removeItem('activeScreenShareSession');

    if (streamInterval) {
        clearInterval(streamInterval);
        streamInterval = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    
    if (audioProcessor) {
        audioProcessor.disconnect();
        audioProcessor = null;
    }

    if (ws) {
        ws.close();
        ws = null;
    }

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
    if (elements.participantList.querySelector('.text-slate-500')) {
        elements.participantList.innerHTML = '';
    }
    
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
        <div class="w-2 h-2 bg-green-500 rounded-full pulse"></div>
    `;
    elements.participantList.appendChild(div);
    updateParticipantCount();
}

function removeParticipant(userId) {
    const elem = document.getElementById(`participant-${userId}`);
    if (elem) {
        elem.style.opacity = '0';
        setTimeout(() => elem.remove(), 300);
    }
    updateParticipantCount();
}

function clearParticipants() {
    elements.participantList.innerHTML = `
        <div class="text-center py-8 text-slate-500">
            <i class="fas fa-user-friends text-3xl mb-2 opacity-50"></i>
            <p class="text-sm">No participants yet</p>
        </div>
    `;
    updateParticipantCount();
}

function updateParticipantCount() {
    const count = elements.participantList.querySelectorAll('.participant-item').length;
    elements.participantCount.textContent = count;
    elements.viewerCount.innerHTML = `<i class="fas fa-eye mr-1"></i>${count} viewer${count !== 1 ? 's' : ''}`;
}

function sendChat() {
    const message = elements.chatInput.value.trim();
    if (!message || !ws) return;

    ws.send(JSON.stringify({
        type: 'chat',
        message: message
    }));

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
        div.innerHTML = `
            <div class="flex items-start gap-2">
                <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    ${username.charAt(0)}
                </div>
                <div class="flex-1">
                    <p class="text-xs text-blue-400 font-medium mb-1">${username}</p>
                    <p class="text-white text-sm">${message}</p>
                </div>
            </div>
        `;
    } else {
        div.className += ' bg-slate-800/50 rounded-lg p-3';
        div.innerHTML = `
            <div class="flex items-start gap-2">
                <div class="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    ${username.charAt(0)}
                </div>
                <div class="flex-1">
                    <p class="text-xs text-slate-400 font-medium mb-1">${username}</p>
                    <p class="text-white text-sm">${message}</p>
                </div>
            </div>
        `;
    }
    
    elements.chatMessages.appendChild(div);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Event listeners
elements.startBtn.addEventListener('click', startSession);
elements.stopBtn.addEventListener('click', stopSession);
elements.sendChatBtn.addEventListener('click', sendChat);
elements.chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
});
elements.micBtn.addEventListener('click', toggleMic);

async function startAudioCapture() {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(audioStream);
        audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        
        source.connect(audioProcessor);
        audioProcessor.connect(audioContext.destination);
        
        audioProcessor.onaudioprocess = (e) => {
            if (!isMicMuted && ws && ws.readyState === WebSocket.OPEN) {
                const audioData = e.inputBuffer.getChannelData(0);
                const audioArray = Array.from(audioData);
                ws.send(JSON.stringify({
                    type: 'audio_data',
                    data: audioArray
                }));
            }
        };
        
        updateMicButton();
    } catch (error) {
        console.error('Error capturing audio:', error);
        showNotification('Microphone access denied', 'error');
    }
}

function toggleMic() {
    isMicMuted = !isMicMuted;
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

function playAudio(audioData) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        const buffer = audioContext.createBuffer(1, audioData.length, audioContext.sampleRate);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < audioData.length; i++) {
            channelData[i] = audioData[i];
        }
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
    } catch (error) {
        console.error('Error playing audio:', error);
    }
}

// Check auth on load
if (!getToken()) {
    showNotification('Please login first', 'error');
    setTimeout(() => window.location.href = '/auth', 2000);
} else {
    // Check for active session on page load
    checkActiveSession();
}

function showJoinRequest(msg) {
    const notification = document.createElement('div');
    notification.className = 'fixed top-20 right-4 glass text-white px-6 py-4 rounded-lg shadow-2xl z-50 w-80';
    notification.innerHTML = `
        <div class="flex items-start justify-between mb-3">
            <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-semibold">
                    ${msg.username.charAt(0).toUpperCase()}
                </div>
                <div>
                    <p class="font-semibold">${msg.username}</p>
                    <p class="text-xs text-slate-400">wants to join</p>
                </div>
            </div>
        </div>
        <div class="flex space-x-2">
            <button onclick="reviewJoinRequest(${msg.data}, 'approved')" 
                    class="flex-1 bg-green-500 hover:bg-green-600 py-2 rounded-lg text-sm font-medium transition-colors">
                <i class="fas fa-check mr-1"></i>Approve
            </button>
            <button onclick="reviewJoinRequest(${msg.data}, 'rejected')" 
                    class="flex-1 bg-red-500 hover:bg-red-600 py-2 rounded-lg text-sm font-medium transition-colors">
                <i class="fas fa-times mr-1"></i>Decline
            </button>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Auto-remove after 30 seconds
    setTimeout(() => notification.remove(), 30000);
}

async function reviewJoinRequest(requestId, status) {
    try {
        const response = await fetch(`${API_BASE}/api/screenshare/requests/${requestId}/review`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });

        if (response.ok) {
            showNotification(`Request ${status}`, 'success');
            // Remove notification
            document.querySelectorAll('.fixed.top-20').forEach(el => el.remove());
        }
    } catch (error) {
        console.error('Error reviewing request:', error);
    }
}

window.reviewJoinRequest = reviewJoinRequest;

async function checkActiveSession() {
    const savedSession = localStorage.getItem('activeScreenShareSession');
    if (savedSession) {
        try {
            const sessionData = JSON.parse(savedSession);
            console.log('Found saved session:', sessionData);
            
            // Verify session is still active on server
            const response = await fetch(`${API_BASE}/api/screenshare/sessions`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await response.json();
            console.log('Active sessions from server:', data.sessions);
            
            const activeSession = data.sessions?.find(s => s.id === sessionData.id && s.is_active);
            
            if (activeSession) {
                console.log('Session is still active, showing resume option...');
                currentSession = activeSession;
                showNotification('Previous session found. Click "Resume Streaming" to continue.', 'info');
                // Update UI to show resume button
                updateUI(true);
                elements.stopBtn.classList.add('hidden');
                elements.startBtn.classList.remove('hidden');
                elements.startBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Resume Streaming';
                elements.startBtn.disabled = false;
                // Reconnect WebSocket
                connectWebSocket();
            } else {
                console.log('Session no longer active');
                localStorage.removeItem('activeScreenShareSession');
                currentSession = null;
            }
        } catch (error) {
            console.error('Error checking active session:', error);
            localStorage.removeItem('activeScreenShareSession');
            currentSession = null;
        }
    }
}
