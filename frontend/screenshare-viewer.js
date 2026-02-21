// Viewer Screen Share Controller
const API_BASE = window.location.origin;
const WS_BASE = API_BASE.replace('http', 'ws');

let currentSession = null;
let ws = null;
let joinRequestStatus = 'none'; // none, pending, approved, rejected
let audioStream = null;
let audioContext = null;
let audioProcessor = null;
let isMicMuted = true;

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
    infoAdminName: document.getElementById('infoAdminName'),
    startedAt: document.getElementById('startedAt'),
    viewerCount: document.getElementById('viewerCount')
};

function getToken() {
    return localStorage.getItem('token');
}

function showNotification(message, type = 'info') {
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
        warning: 'bg-yellow-500'
    };
    
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        info: 'info-circle',
        warning: 'exclamation-triangle'
    };
    
    const notification = document.createElement('div');
    notification.className = `notification fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50`;
    notification.innerHTML = `<i class="fas fa-${icons[type]} mr-2"></i>${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

async function loadActiveSessions() {
    try {
        const response = await fetch(`${API_BASE}/api/screenshare/sessions`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const data = await response.json();
        const userResponse = await fetch(`${API_BASE}/api/user/profile`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const userData = await userResponse.json();
        const currentUserId = userData.user?.id;
        
        const activeSessions = (data.sessions || []).filter(s => s.is_active && s.admin_id !== currentUserId);
        displaySessions(activeSessions);
    } catch (error) {
        console.error('Error loading sessions:', error);
        showNotification('Failed to load sessions', 'error');
    }
}

function displaySessions(sessions) {
    elements.sessionsContainer.innerHTML = '';

    if (sessions.length === 0) {
        elements.sessionsContainer.innerHTML = `
            <div class="col-span-full text-center py-16">
                <i class="fas fa-video-slash text-6xl text-slate-600 mb-4"></i>
                <h3 class="text-xl font-semibold text-slate-400 mb-2">No Live Sessions</h3>
                <p class="text-slate-500">Check back later for live trading sessions</p>
            </div>
        `;
        return;
    }

    sessions.forEach((session, index) => {
        const card = document.createElement('div');
        card.className = 'session-card glass rounded-xl p-6';
        card.style.animationDelay = `${index * 0.1}s`;
        card.innerHTML = `
            <div class="flex items-start justify-between mb-4">
                <div class="flex items-center space-x-3">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                        <i class="fas fa-user-tie text-white text-xl"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-semibold text-white">${session.admin_name}</h3>
                        <p class="text-sm text-slate-400">Live Trading Session</p>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="w-2 h-2 bg-green-500 rounded-full pulse"></div>
                    <span class="text-green-400 text-sm font-medium">LIVE</span>
                </div>
            </div>
            <div class="space-y-2 mb-4">
                <div class="flex items-center text-sm text-slate-400">
                    <i class="fas fa-clock mr-2 text-blue-400"></i>
                    Started ${new Date(session.started_at).toLocaleString()}
                </div>
                <div class="flex items-center text-sm text-slate-400">
                    <i class="fas fa-chart-line mr-2 text-green-400"></i>
                    Real-time market analysis & trading
                </div>
            </div>
            <button onclick="requestJoinSession(${session.id})" 
                    class="w-full btn-primary py-3 rounded-lg font-medium transition-all shadow-lg hover:shadow-xl">
                <i class="fas fa-sign-in-alt mr-2"></i>Request to Join
            </button>
        `;
        elements.sessionsContainer.appendChild(card);
    });
}

async function requestJoinSession(sessionId) {
    try {
        const response = await fetch(`${API_BASE}/api/screenshare/join/${sessionId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const data = await response.json();
        
        if (response.ok) {
            // Get session details
            const sessionsResponse = await fetch(`${API_BASE}/api/screenshare/sessions`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const sessionsData = await sessionsResponse.json();
            currentSession = sessionsData.sessions?.find(s => s.id === sessionId);
            
            if (currentSession) {
                // Check if auto-approved (user was previously approved)
                if (data.auto_approved) {
                    showNotification('Rejoining session...', 'success');
                    joinRequestStatus = 'approved';
                    // Save session with approved status
                    localStorage.setItem('activeScreenShareSession', JSON.stringify({
                        sessionId: sessionId,
                        status: 'approved',
                        session: currentSession
                    }));
                } else {
                    showNotification('Join request sent! Waiting for admin approval...', 'success');
                    joinRequestStatus = 'pending';
                    // Save session with pending status
                    localStorage.setItem('activeScreenShareSession', JSON.stringify({
                        sessionId: sessionId,
                        status: 'pending',
                        session: currentSession
                    }));
                }
                
                showWaitingForApproval();
                connectWebSocket(sessionId);
                
                // If auto-approved, update UI immediately
                if (data.auto_approved) {
                    elements.waitingMessage.innerHTML = `
                        <i class="fas fa-check-circle text-6xl mb-4 text-green-500"></i>
                        <p class="text-lg text-green-400">Access Granted!</p>
                        <p class="text-sm text-slate-400 mt-2">Waiting for screen data...</p>
                    `;
                    elements.micBtn.classList.remove('hidden');
                    startAudioCapture();
                }
            }
        } else {
            showNotification(data.error || data.message || 'Failed to send request', 'error');
        }
    } catch (error) {
        console.error('Error requesting to join:', error);
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
    
    elements.waitingMessage.innerHTML = `
        <i class="fas fa-hourglass-half text-6xl mb-4 text-yellow-500"></i>
        <p class="text-lg text-yellow-400">Waiting for Admin Approval...</p>
        <p class="text-sm text-slate-400 mt-2">The admin will review your request shortly</p>
    `;
}

function connectWebSocket(sessionId) {
    ws = new WebSocket(`${WS_BASE}/ws/screenshare?session_id=${sessionId}&token=${getToken()}`);

    ws.onopen = () => {
        console.log('Connected to session');
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleWebSocketMessage(msg);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('Disconnected from session');
        if (joinRequestStatus === 'approved') {
            showNotification('Connection lost. Reconnecting...', 'info');
            // Try to reconnect
            setTimeout(() => {
                if (currentSession) {
                    console.log('Attempting to reconnect...');
                    connectWebSocket(currentSession.id);
                }
            }, 2000);
        }
    };
}

function handleWebSocketMessage(msg) {
    console.log('WebSocket message:', msg);
    switch (msg.type) {
        case 'join_response':
            if (msg.data === 'approved') {
                joinRequestStatus = 'approved';
                // Update localStorage with approved status
                const savedSession = JSON.parse(localStorage.getItem('activeScreenShareSession') || '{}');
                if (savedSession.sessionId) {
                    savedSession.status = 'approved';
                    localStorage.setItem('activeScreenShareSession', JSON.stringify(savedSession));
                }
                showNotification('Access granted! Enjoy the session', 'success');
                elements.waitingMessage.innerHTML = `
                    <i class="fas fa-check-circle text-6xl mb-4 text-green-500"></i>
                    <p class="text-lg text-green-400">Access Granted!</p>
                    <p class="text-sm text-slate-400 mt-2">Waiting for screen data...</p>
                `;
                elements.micBtn.classList.remove('hidden');
                startAudioCapture();
            } else if (msg.data === 'rejected') {
                joinRequestStatus = 'rejected';
                localStorage.removeItem('activeScreenShareSession');
                showNotification('Your request was declined', 'error');
                elements.waitingMessage.innerHTML = `
                    <i class="fas fa-times-circle text-6xl mb-4 text-red-500"></i>
                    <p class="text-lg text-red-400">Request Declined</p>
                    <p class="text-sm text-slate-400 mt-2">Redirecting...</p>
                `;
                setTimeout(() => leaveSession(), 2000);
            }
            break;
        case 'screen_data':
            if (joinRequestStatus === 'approved') {
                displayScreenFrame(msg.data);
            }
            break;
        case 'chat':
            if (joinRequestStatus === 'approved') {
                // Don't show our own messages again
                if (msg.user_id !== parseInt(localStorage.getItem('user_id'))) {
                    addChatMessage(msg.message, 'user', msg.username);
                }
            }
            break;
        case 'audio_data':
            if (joinRequestStatus === 'approved') {
                playAudio(msg.data);
            }
            break;
        case 'session_ended':
            localStorage.removeItem('activeScreenShareSession');
            showNotification('Admin ended the session', 'warning');
            setTimeout(() => leaveSession(), 2000);
            break;
    }
}

function displayScreenFrame(frameData) {
    elements.waitingMessage.style.display = 'none';
    elements.screenCanvas.style.display = 'block';

    const img = new Image();
    img.onload = () => {
        const canvas = elements.screenCanvas;
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
    };
    img.src = frameData;
}

function leaveSession() {
    if (ws) {
        ws.close();
        ws = null;
    }

    // Clear saved session
    localStorage.removeItem('activeScreenShareSession');
    
    currentSession = null;
    joinRequestStatus = 'none';
    elements.viewerInterface.classList.add('hidden');
    elements.sessionsList.classList.remove('hidden');
    elements.waitingMessage.style.display = 'flex';
    elements.screenCanvas.style.display = 'none';
    elements.chatMessages.innerHTML = '';
    
    loadActiveSessions();
}

function sendChat() {
    const message = elements.chatInput.value.trim();
    if (!message || !ws || ws.readyState !== WebSocket.OPEN) return;
    
    if (joinRequestStatus !== 'approved') {
        showNotification('Wait for admin approval to chat', 'warning');
        return;
    }

    ws.send(JSON.stringify({
        type: 'chat',
        message: message
    }));

    // Show our own message immediately
    addChatMessage(message, 'user', 'You');
    elements.chatInput.value = '';
}

function addChatMessage(message, type = 'user', username = 'You') {
    const div = document.createElement('div');
    div.className = 'chat-message';
    
    if (type === 'system') {
        div.className += ' text-center text-slate-500 text-sm py-2';
        div.innerHTML = `<i class="fas fa-info-circle mr-1"></i>${message}`;
    } else {
        const isMe = username === 'You';
        div.className += ` ${isMe ? 'bg-blue-500/20' : 'bg-slate-800/50'} rounded-lg p-3`;
        div.innerHTML = `
            <div class="flex items-start gap-2">
                <div class="w-8 h-8 rounded-full ${isMe ? 'bg-blue-500' : 'bg-purple-500'} flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    ${username.charAt(0)}
                </div>
                <div class="flex-1">
                    <p class="text-xs ${isMe ? 'text-blue-400' : 'text-slate-400'} font-medium mb-1">${username}</p>
                    <p class="text-white text-sm">${message}</p>
                </div>
            </div>
        `;
    }
    
    elements.chatMessages.appendChild(div);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Event listeners
elements.leaveBtn.addEventListener('click', leaveSession);
elements.sendChatBtn.addEventListener('click', sendChat);
elements.chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
});

// Fullscreen functionality
elements.fullscreenBtn.addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
    const container = elements.screenContainer;
    
    if (!document.fullscreenElement) {
        if (container.requestFullscreen) {
            container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
            container.webkitRequestFullscreen();
        } else if (container.mozRequestFullScreen) {
            container.mozRequestFullScreen();
        }
        elements.fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        }
        elements.fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    }
}

// Update fullscreen button icon on fullscreen change
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        elements.fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    }
});

document.addEventListener('webkitfullscreenchange', () => {
    if (!document.webkitFullscreenElement) {
        elements.fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    }
});

document.addEventListener('mozfullscreenchange', () => {
    if (!document.mozFullScreenElement) {
        elements.fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    }
});

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
                // Only log occasionally to avoid spam
                if (Math.random() < 0.01) {
                    console.log('Sending audio, length:', audioArray.length, 'first value:', audioArray[0]);
                }
                ws.send(JSON.stringify({
                    type: 'audio_data',
                    data: audioArray
                }));
            }
        };
        
        updateMicButton();
    } catch (error) {
        console.error('Error capturing audio:', error);
    }
}

function toggleMic() {
    isMicMuted = !isMicMuted;
    updateMicButton();
    console.log('Mic toggled:', isMicMuted ? 'MUTED' : 'UNMUTED');
    console.log('WebSocket state:', ws ? ws.readyState : 'null');
    console.log('Audio processor:', audioProcessor ? 'exists' : 'null');
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

elements.micBtn.addEventListener('click', toggleMic);

// Make function global
window.requestJoinSession = requestJoinSession;
window.loadActiveSessions = loadActiveSessions;

// Check auth and load sessions
if (!getToken()) {
    showNotification('Please login first', 'error');
    setTimeout(() => window.location.href = '/auth', 2000);
} else {
    // Get and store user ID for chat filtering
    fetch(`${API_BASE}/api/user/profile`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    })
    .then(res => res.json())
    .then(data => {
        if (data.user?.id) {
            localStorage.setItem('user_id', data.user.id);
        }
    });
    
    // Check for saved session on page load
    const savedSession = localStorage.getItem('activeScreenShareSession');
    if (savedSession) {
        try {
            const sessionData = JSON.parse(savedSession);
            currentSession = sessionData.session;
            joinRequestStatus = sessionData.status;
            
            // Verify session is still active
            fetch(`${API_BASE}/api/screenshare/sessions`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            })
            .then(res => res.json())
            .then(data => {
                const activeSession = data.sessions?.find(s => s.id === sessionData.sessionId && s.is_active);
                if (activeSession) {
                    // Rejoin the session
                    showNotification('Reconnecting to session...', 'info');
                    showWaitingForApproval();
                    connectWebSocket(sessionData.sessionId);
                    if (sessionData.status === 'approved') {
                        elements.waitingMessage.innerHTML = `
                            <i class="fas fa-check-circle text-6xl mb-4 text-green-500"></i>
                            <p class="text-lg text-green-400">Access Granted!</p>
                            <p class="text-sm text-slate-400 mt-2">Waiting for screen data...</p>
                        `;
                        elements.micBtn.classList.remove('hidden');
                        startAudioCapture();
                    }
                } else {
                    // Session no longer active
                    localStorage.removeItem('activeScreenShareSession');
                    loadActiveSessions();
                }
            })
            .catch(() => {
                localStorage.removeItem('activeScreenShareSession');
                loadActiveSessions();
            });
        } catch (e) {
            localStorage.removeItem('activeScreenShareSession');
            loadActiveSessions();
        }
    } else {
        loadActiveSessions();
    }
    
    setInterval(loadActiveSessions, 10000); // Refresh every 10 seconds
}
