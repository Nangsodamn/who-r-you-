let currentUser = null;
let currentPMUser = null;
let unsubscribeGC = null;
let unsubscribePM = null;
let unsubscribeUsers = null;
let unsubscribeMembers = null;
let unsubscribeUnreadPMs = null;
let unsubscribeTyping = null;
let isUploading = false;
let currentTheme = 'dark';
let searchTimeout = null;
let currentPinnedMessageId = null;
let currentMessageForReaction = null;
let currentMessageForForward = null;
let recognition = null;
let isRecording = false;

let currentSelectedMessageForReactionView = null;
let currentReactionViewMessageId = null;

window.displayedGCMessageIds = new Set();
window.displayedPMMessageIds = new Set();
window.gcMessagesLoaded = false;
window.pmMessagesLoaded = false;

let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimer = null;
let currentAudioBlob = null;
let currentAudioUrl = null;
let audioPlayer = null;
let isPlaying = false;
let currentVoiceMessageId = null;

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let callActive = false;
let callStartTime = null;
let callTimer = null;
let currentCallType = null; 
let currentCallId = null;
let incomingCallData = null;
let callRingtone = null;

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

function initVoicePlayer() {
    audioPlayer = document.getElementById('voice-audio-player');
    if (!audioPlayer) return;
    
    audioPlayer.addEventListener('timeupdate', updateWaveformProgress);
    audioPlayer.addEventListener('ended', onVoicePlayEnd);
    audioPlayer.addEventListener('loadedmetadata', onVoiceLoaded);
}

async function startVoiceRecording(isGC = true) {
    try {
        if (!navigator.mediaDevices || !window.MediaRecorder) {
            showToast('Voice recording not supported in this browser', 'error');
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });

        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            currentAudioBlob = audioBlob;

            stream.getTracks().forEach(track => track.stop());

            await sendVoiceMessage(audioBlob, isGC);

            stopRecordingIndicator();
        };

        mediaRecorder.start();
        recordingStartTime = Date.now();

        showRecordingIndicator();
        startRecordingTimer();
        
        console.log('🎤 Recording started');
        
    } catch (error) {
        console.error('❌ Recording error:', error);
        showToast('Microphone access denied or not available', 'error');
    }
}

function showRecordingIndicator() {
    let indicator = document.getElementById('voice-recording-indicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'voice-recording-indicator';
        indicator.className = 'voice-recording';
        indicator.innerHTML = `
            <i class="fas fa-microphone"></i>
            <span class="voice-timer">0:00</span>
            <button onclick="stopVoiceRecording()" class="stop-recording">
                <i class="fas fa-stop"></i> Send
            </button>
        `;
        document.body.appendChild(indicator);
    }
    
    indicator.classList.remove('hidden');
}

function stopVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    
    stopRecordingIndicator();
}

function stopRecordingIndicator() {
    const indicator = document.getElementById('voice-recording-indicator');
    if (indicator) {
        indicator.classList.add('hidden');
    }
    
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
}

function startRecordingTimer() {
    recordingTimer = setInterval(() => {
        if (!recordingStartTime) return;
        
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        const timerEl = document.querySelector('.voice-timer');
        if (timerEl) {
            timerEl.textContent = timeString;
        }

        if (elapsed >= 300) {
            stopVoiceRecording();
            showToast('Maximum recording time reached', 'info');
        }
    }, 1000);
}

async function sendVoiceMessage(audioBlob, isGC = true) {
    try {
        showToast('📤 Uploading voice message...', 'info');

        const base64Audio = await blobToBase64(audioBlob);
        const duration = await getAudioDuration(audioBlob);
        const waveformData = generateWaveformData();
        
        if (isGC) {
            await db.collection('groupChats').doc(GROUP_CHAT_ID)
                .collection('messages').add({
                    type: 'voice',
                    audioData: base64Audio,
                    duration: duration,
                    waveformData: waveformData,
                    senderId: currentUser.uid,
                    senderName: currentUser.displayName || 'User',
                    senderPhoto: currentUser.photoURL || '',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
        } else {
            if (!currentPMUser) {
                showToast('Select a user first', 'error');
                return;
            }
            
            const chatId = [currentUser.uid, currentPMUser.id].sort().join('_');
            
            await db.collection('privateChats').doc(chatId)
                .collection('messages').add({
                    type: 'voice',
                    audioData: base64Audio,
                    duration: duration,
                    waveformData: waveformData,
                    senderId: currentUser.uid,
                    senderName: currentUser.displayName || 'You',
                    senderPhoto: currentUser.photoURL || '',
                    receiverId: currentPMUser.id,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    read: false
                });
        }
        
        showToast('✅ Voice message sent!', 'success');
        
    } catch (error) {
        console.error('❌ Error sending voice message:', error);
        showToast('Failed to send voice message', 'error');
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function getAudioDuration(blob) {
    return new Promise((resolve) => {
        const audio = new Audio();
        audio.src = URL.createObjectURL(blob);
        audio.onloadedmetadata = () => {
            resolve(Math.round(audio.duration));
            URL.revokeObjectURL(audio.src);
        };
    });
}

function generateWaveformData() {
    const data = [];
    for (let i = 0; i < 50; i++) {
        data.push(Math.floor(Math.random() * 40) + 10);
    }
    return data;
}

function playVoiceMessage(audioData, messageId, waveformData = null) {
    try {
        const audio = new Audio(audioData);
        currentAudioUrl = audioData;
        currentVoiceMessageId = messageId;

        const modal = document.getElementById('voice-player-modal');
        if (modal) modal.classList.add('active');

        drawWaveform(waveformData || generateWaveformData());

        const player = document.getElementById('voice-audio-player');
        player.src = audioData;

        player.play();
        isPlaying = true;
        updatePlayButton(true);

        player.ontimeupdate = () => {
            const progress = (player.currentTime / player.duration) * 100 || 0;
            document.getElementById('voice-progress').style.width = `${progress}%`;
            document.getElementById('current-time').textContent = formatTime(player.currentTime);
        };
        
        player.onended = () => {
            isPlaying = false;
            updatePlayButton(false);
            document.getElementById('voice-progress').style.width = '0%';
            document.getElementById('current-time').textContent = '0:00';
        };

        player.onloadedmetadata = () => {
            document.getElementById('total-time').textContent = formatTime(player.duration);
        };
        
    } catch (error) {
        console.error('❌ Error playing voice:', error);
        showToast('Failed to play voice message', 'error');
    }
}

function drawWaveform(waveformData) {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const barWidth = (width - 20) / waveformData.length;
    const centerY = height / 2;
    
    ctx.fillStyle = '#4f46e5';
    
    waveformData.forEach((value, index) => {
        const barHeight = (value / 100) * (height - 20);
        const x = 10 + index * barWidth;
        const y = centerY - barHeight / 2;
        
        ctx.fillRect(x, y, barWidth - 2, barHeight);
    });
}

function updateWaveformProgress() {}

function onVoicePlayEnd() {
    isPlaying = false;
    updatePlayButton(false);
    document.getElementById('voice-progress').style.width = '0%';
    document.getElementById('current-time').textContent = '0:00';
}

function onVoiceLoaded() {
    const audio = document.getElementById('voice-audio-player');
    if (audio) {
        document.getElementById('total-time').textContent = formatTime(audio.duration);
    }
}

function toggleVoicePlay() {
    const audio = document.getElementById('voice-audio-player');
    if (!audio) return;
    
    if (audio.paused) {
        audio.play();
        isPlaying = true;
        updatePlayButton(true);
    } else {
        audio.pause();
        isPlaying = false;
        updatePlayButton(false);
    }
}

function updatePlayButton(playing) {
    const btn = document.getElementById('play-pause-btn');
    if (!btn) return;
    
    if (playing) {
        btn.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        btn.innerHTML = '<i class="fas fa-play"></i>';
    }
}

function seekVoice(event) {
    const container = event.currentTarget;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = x / rect.width;
    
    const audio = document.getElementById('voice-audio-player');
    if (audio && audio.duration) {
        audio.currentTime = audio.duration * percentage;
    }
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function generateWaveformBars() {
    let bars = '';
    for (let i = 0; i < 6; i++) {
        bars += '<div class="voice-bar"></div>';
    }
    return bars;
}

const GROUP_CHAT_ID = "general_chat";

firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = user;

    window.displayedGCMessageIds.clear();
    window.displayedPMMessageIds.clear();
    window.gcMessagesLoaded = false;
    window.pmMessagesLoaded = false;
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initializeApp());
    } else {
        await initializeApp();
    }
});

async function initializeApp() {
    try {
        console.log('Initializing app for user:', currentUser.uid);
        
        const userFirstLetter = (currentUser.displayName || currentUser.email || 'U').charAt(0).toUpperCase();
        const defaultAvatar = `https://ui-avatars.com/api/?name=${userFirstLetter}&background=4f46e5&color=fff&size=200&bold=true`;

        const userNameEl = document.getElementById('current-user-name');
        const userPfpEl = document.getElementById('current-user-pfp');
        
        if (userNameEl) userNameEl.textContent = currentUser.displayName || currentUser.email.split('@')[0] || 'User';

        if (userPfpEl) {
            userPfpEl.src = currentUser.photoURL || defaultAvatar;
            userPfpEl.onerror = function() {
                this.onerror = null;
                this.src = defaultAvatar;
            };
        }

        await db.collection('users').doc(currentUser.uid).set({
            uid: currentUser.uid,
            name: currentUser.displayName || currentUser.email.split('@')[0] || 'Anonymous',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || defaultAvatar,
            online: true,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            lastActive: new Date().toISOString()
        }, { merge: true });

        await initializeGroupChat();
        loadUsers();
        listenToUnreadPMs(); 
        setupPresence();
        setupEnterKeyListeners();
        loadTheme();

        initVoicePlayer();
        
        initCallUI();
        listenForIncomingCalls();

        initUserInfoModals();
        
        console.log('✅ App initialized successfully');
        showToast('✅ Connected to chat!', 'success');
        
    } catch (error) {
        console.error('❌ Error initializing app:', error);
        showToast('Failed to initialize. Refreshing...', 'error');
        setTimeout(() => window.location.reload(), 2000);
    }
}

function initUserInfoModals() {
    if (!document.getElementById('change-name-modal')) {
        const changeNameModal = document.createElement('div');
        changeNameModal.id = 'change-name-modal';
        changeNameModal.className = 'modal';
        changeNameModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Change Display Name</h3>
                    <button onclick="closeModal('change-name-modal')"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <input type="text" id="new-display-name" placeholder="Enter new name" class="modal-input">
                    <div class="modal-actions">
                        <button onclick="updateDisplayName()" class="modal-btn primary">Save Changes</button>
                        <button onclick="closeModal('change-name-modal')" class="modal-btn secondary">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(changeNameModal);
    }

    if (!document.getElementById('reaction-viewers-modal')) {
        const reactionViewersModal = document.createElement('div');
        reactionViewersModal.id = 'reaction-viewers-modal';
        reactionViewersModal.className = 'modal';
        reactionViewersModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="reaction-viewers-title">Reactions</h3>
                    <button onclick="closeModal('reaction-viewers-modal')"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div id="reaction-viewers-list" class="users-list"></div>
                </div>
            </div>
        `;
        document.body.appendChild(reactionViewersModal);
    }

    if (!document.getElementById('user-info-modal')) {
        const userInfoModal = document.createElement('div');
        userInfoModal.id = 'user-info-modal';
        userInfoModal.className = 'modal';
        userInfoModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>User Information</h3>
                    <button onclick="closeModal('user-info-modal')"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body user-info-body">
                    <div class="user-info-avatar">
                        <img id="user-info-avatar" src="" alt="">
                    </div>
                    <div class="user-info-details">
                        <div class="info-row">
                            <label>Name:</label>
                            <span id="user-info-name"></span>
                        </div>
                        <div class="info-row">
                            <label>Email:</label>
                            <span id="user-info-email"></span>
                        </div>
                        <div class="info-row">
                            <label>Status:</label>
                            <span id="user-info-status"></span>
                        </div>
                        <div class="info-row">
                            <label>Last Seen:</label>
                            <span id="user-info-lastseen"></span>
                        </div>
                        <div class="info-row">
                            <label>User ID:</label>
                            <span id="user-info-uid"></span>
                        </div>
                        <div class="info-row">
                            <label>Joined:</label>
                            <span id="user-info-joined"></span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(userInfoModal);
    }
}

function showChangeNameModal() {
    const modal = document.getElementById('change-name-modal');
    const input = document.getElementById('new-display-name');
    if (input && currentUser) {
        input.value = currentUser.displayName || '';
    }
    if (modal) modal.classList.add('active');
}

async function updateDisplayName() {
    const input = document.getElementById('new-display-name');
    const newName = input.value.trim();
    
    if (!newName) {
        showToast('Please enter a name', 'error');
        return;
    }
    
    try {
        await currentUser.updateProfile({
            displayName: newName
        });
        
        await db.collection('users').doc(currentUser.uid).update({
            name: newName,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        const userNameEl = document.getElementById('current-user-name');
        if (userNameEl) userNameEl.textContent = newName;
        
        showToast('✅ Name updated successfully!', 'success');
        closeModal('change-name-modal');
        
    } catch (error) {
        console.error('Error updating name:', error);
        showToast('Failed to update name', 'error');
    }
}

async function showReactionViewers(messageId, reaction, isGC = true) {
    try {
        let messageData;
        
        if (isGC) {
            const doc = await db.collection('groupChats').doc(GROUP_CHAT_ID)
                .collection('messages').doc(messageId).get();
            messageData = doc.data();
        } else {
            if (!currentPMUser) return;
            const chatId = [currentUser.uid, currentPMUser.id].sort().join('_');
            const doc = await db.collection('privateChats').doc(chatId)
                .collection('messages').doc(messageId).get();
            messageData = doc.data();
        }
        
        if (!messageData || !messageData.reactions) return;

        const userIds = [];
        Object.entries(messageData.reactions).forEach(([userId, userReaction]) => {
            if (userReaction === reaction) {
                userIds.push(userId);
            }
        });
        
        if (userIds.length === 0) return;

        const usersList = document.getElementById('reaction-viewers-list');
        const title = document.getElementById('reaction-viewers-title');
        title.innerHTML = `${reaction} - ${userIds.length} ${userIds.length === 1 ? 'person' : 'people'}`;
        
        usersList.innerHTML = '<div class="loading">Loading users...</div>';
        
        const userPromises = userIds.map(uid => 
            db.collection('users').doc(uid).get()
        );
        
        const userDocs = await Promise.all(userPromises);
        
        usersList.innerHTML = '';
        
        userDocs.forEach(doc => {
            if (doc.exists) {
                const user = doc.data();
                const userDiv = document.createElement('div');
                userDiv.className = 'user-item';
                userDiv.onclick = () => showUserInfo(user.uid);
                
                const firstLetter = (user.name || 'User').charAt(0).toUpperCase();
                const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${firstLetter}&background=4f46e5&color=fff&size=100`;
                
                userDiv.innerHTML = `
                    <div class="user-item-avatar">
                        <img src="${avatarUrl}" alt="${escapeHTML(user.name || 'User')}">
                        <span class="status-indicator ${user.online ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="user-item-info">
                        <div class="user-item-name">${escapeHTML(user.name || 'User')}</div>
                        <div class="user-item-status">${user.online ? '● Online' : formatLastSeen(user.lastSeen)}</div>
                    </div>
                    <div class="user-reaction-badge">
                        ${reaction}
                    </div>
                `;
                usersList.appendChild(userDiv);
            }
        });
        
        const modal = document.getElementById('reaction-viewers-modal');
        if (modal) modal.classList.add('active');
        
    } catch (error) {
        console.error('Error showing reaction viewers:', error);
        showToast('Failed to load reaction viewers', 'error');
    }
}

async function showUserInfo(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            showToast('User not found', 'error');
            return;
        }
        
        const user = userDoc.data();

        let email = user.email || 'Not available';
        let joined = user.joinedAt ? new Date(user.joinedAt.toDate()).toLocaleDateString() : 'Unknown';

        document.getElementById('user-info-name').textContent = user.name || 'Unknown';
        document.getElementById('user-info-email').textContent = email;
        document.getElementById('user-info-status').textContent = user.online ? 'Online' : 'Offline';
        document.getElementById('user-info-lastseen').textContent = user.online ? 'Now' : (user.lastSeen ? formatLastSeenFull(user.lastSeen) : 'Unknown');
        document.getElementById('user-info-uid').textContent = userId;
        document.getElementById('user-info-joined').textContent = joined;
        
        const avatar = document.getElementById('user-info-avatar');
        const firstLetter = (user.name || 'U').charAt(0).toUpperCase();
        avatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${firstLetter}&background=4f46e5&color=fff&size=200`;
        
        const modal = document.getElementById('user-info-modal');
        if (modal) modal.classList.add('active');
        
    } catch (error) {
        console.error('Error loading user info:', error);
        showToast('Failed to load user information', 'error');
    }
}

function formatLastSeenFull(timestamp) {
    if (!timestamp) return 'Unknown';
    if (!timestamp.toDate) return 'Unknown';
    
    const lastSeen = timestamp.toDate();
    const now = new Date();
    const diffSeconds = Math.floor((now - lastSeen) / 1000);
    
    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} minutes ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} hours ago`;
    if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)} days ago`;
    
    return lastSeen.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function initCallUI() {
    const pmActions = document.querySelector('.pm-actions');
    if (pmActions && !document.querySelector('.pm-call-btn')) {
        const audioCallBtn = document.createElement('button');
        audioCallBtn.className = 'pm-call-btn';
        audioCallBtn.setAttribute('onclick', 'startAudioCall()');
        audioCallBtn.setAttribute('title', 'Audio call');
        audioCallBtn.innerHTML = '<i class="fas fa-phone"></i>';
        pmActions.insertBefore(audioCallBtn, pmActions.firstChild);

        const videoCallBtn = document.createElement('button');
        videoCallBtn.className = 'pm-video-btn';
        videoCallBtn.setAttribute('onclick', 'startVideoCall()');
        videoCallBtn.setAttribute('title', 'Video call');
        videoCallBtn.innerHTML = '<i class="fas fa-video"></i>';
        pmActions.insertBefore(videoCallBtn, pmActions.firstChild);
    }

    if (!document.getElementById('call-modal')) {
        const callModal = document.createElement('div');
        callModal.id = 'call-modal';
        callModal.className = 'modal call-modal';
        callModal.innerHTML = `
            <div class="modal-content call-content">
                <div class="call-header">
                    <div class="call-user-info">
                        <img id="call-user-pfp" src="" alt="">
                        <div>
                            <h3 id="call-user-name">Calling...</h3>
                            <span id="call-status">Ringing</span>
                        </div>
                    </div>
                    <button onclick="endCall()"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="video-container" id="video-container" style="display: none;">
                    <video id="remote-video" autoplay playsinline></video>
                    <video id="local-video" autoplay playsinline muted></video>
                </div>
                
                <div class="audio-container" id="audio-container">
                    <div class="caller-avatar">
                        <img id="caller-avatar" src="" alt="">
                    </div>
                    <div class="call-wave">
                        <span></span><span></span><span></span><span></span><span></span>
                    </div>
                </div>
                
                <div class="call-controls">
                    <button onclick="toggleMute()" id="mute-btn" class="call-control-btn">
                        <i class="fas fa-microphone"></i>
                    </button>
                    <button onclick="toggleVideo()" id="video-btn" class="call-control-btn">
                        <i class="fas fa-video"></i>
                    </button>
                    <button onclick="toggleSpeaker()" id="speaker-btn" class="call-control-btn">
                        <i class="fas fa-volume-up"></i>
                    </button>
                    <button onclick="endCall()" class="call-control-btn end-call">
                        <i class="fas fa-phone-slash"></i>
                    </button>
                </div>
                
                <div class="call-duration" id="call-duration">00:00</div>
            </div>
        `;
        document.body.appendChild(callModal);
    }

    if (!document.getElementById('incoming-call-modal')) {
        const incomingModal = document.createElement('div');
        incomingModal.id = 'incoming-call-modal';
        incomingModal.className = 'modal incoming-modal';
        incomingModal.innerHTML = `
            <div class="modal-content incoming-content">
                <div class="incoming-call">
                    <img id="incoming-caller-pfp" src="" alt="">
                    <h3 id="incoming-caller-name">Incoming Call...</h3>
                    <p id="incoming-call-type">Video call</p>
                    <div class="incoming-actions">
                        <button onclick="acceptCall()" class="accept-btn">
                            <i class="fas fa-phone"></i> Accept
                        </button>
                        <button onclick="declineCall()" class="decline-btn">
                            <i class="fas fa-phone-slash"></i> Decline
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(incomingModal);
    }
}

function startAudioCall() {
    if (!currentPMUser) {
        showToast('Select a user first to call', 'error');
        return;
    }
    currentCallType = 'audio';
    initializeCall();
}

function startVideoCall() {
    if (!currentPMUser) {
        showToast('Select a user first to call', 'error');
        return;
    }
    currentCallType = 'video';
    initializeCall();
}

async function initializeCall() {
    try {
        const constraints = {
            audio: true,
            video: currentCallType === 'video'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (currentCallType === 'video') {
            document.getElementById('local-video').srcObject = localStream;
            document.getElementById('video-container').style.display = 'block';
            document.getElementById('audio-container').style.display = 'none';
            document.getElementById('video-btn').style.display = 'flex';
        } else {
            document.getElementById('video-container').style.display = 'none';
            document.getElementById('audio-container').style.display = 'flex';
            document.getElementById('video-btn').style.display = 'none';
        }
        
        document.getElementById('call-user-name').innerText = currentPMUser.name || 'User';
        document.getElementById('call-user-pfp').src = currentPMUser.photoURL || `https://ui-avatars.com/api/?name=${(currentPMUser.name || 'U').charAt(0)}&background=4f46e5&color=fff`;
        document.getElementById('caller-avatar').src = currentPMUser.photoURL || `https://ui-avatars.com/api/?name=${(currentPMUser.name || 'U').charAt(0)}&background=4f46e5&color=fff`;
        document.getElementById('call-status').innerText = 'Calling...';
        
        document.getElementById('call-modal').classList.add('active');

        peerConnection = new RTCPeerConnection(iceServers);
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        peerConnection.ontrack = event => {
            remoteStream = event.streams[0];

            if (currentCallType === 'video') {
                document.getElementById('remote-video').srcObject = remoteStream;
            } 
            
            let audioElement = document.getElementById('remote-audio');
            if (!audioElement) {
                audioElement = document.createElement('audio');
                audioElement.id = 'remote-audio';
                audioElement.autoplay = true;
                audioElement.style.display = 'none';
                document.body.appendChild(audioElement);
            }

            audioElement.srcObject = remoteStream;
            audioElement.play().catch(e => console.log('Audio play error:', e));
            
            document.getElementById('call-status').innerText = 'Connected';
        };

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                sendCallCandidate(event.candidate);
            }
        };
        
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'disconnected' || 
                peerConnection.iceConnectionState === 'failed') {
                showToast('Call disconnected', 'error');
                endCall();
            }
        };
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const callId = `${currentUser.uid}_${currentPMUser.id}_${Date.now()}`;
        currentCallId = callId;
        
        await db.collection('calls').doc(callId).set({
            offer: {
                type: offer.type,
                sdp: offer.sdp
            },
            callerId: currentUser.uid,
            callerName: currentUser.displayName || 'User',
            callerPhoto: currentUser.photoURL || '',
            receiverId: currentPMUser.id,
            receiverName: currentPMUser.name,
            receiverPhoto: currentPMUser.photoURL,
            type: currentCallType,
            status: 'ringing',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        listenForCallAnswer(callId);
        
        startCallTimer();
        callActive = true;
        
    } catch (error) {
        console.error('Error starting call:', error);
        showToast('Could not access camera/microphone', 'error');
        endCall();
    }
}

async function sendCallCandidate(candidate) {
    if (!currentCallId) return;
    
    try {
        await db.collection('calls').doc(currentCallId).update({
            [`candidates.${currentUser.uid}`]: firebase.firestore.FieldValue.arrayUnion({
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: candidate.sdpMLineIndex
            })
        });
    } catch (error) {
        console.error('Error sending candidate:', error);
    }
}

function listenForCallAnswer(callId) {
    db.collection('calls').doc(callId).onSnapshot(snapshot => {
        const data = snapshot.data();
        if (!data) return;

        if (data.answer && !peerConnection.currentRemoteDescription) {
            const answer = new RTCSessionDescription({
                type: data.answer.type,
                sdp: data.answer.sdp
            });
            peerConnection.setRemoteDescription(answer)
                .then(() => {
                    document.getElementById('call-status').innerText = 'Connected';
                })
                .catch(error => console.error('Error setting remote description:', error));
        }

        if (data.candidates && data.candidates[currentPMUser.id]) {
            data.candidates[currentPMUser.id].forEach(candidate => {
                if (peerConnection.remoteDescription) {
                    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                        .catch(error => console.error('Error adding ICE candidate:', error));
                }
            });
        }

        if (data.status === 'ended' || data.status === 'declined') {
            if (callActive) {
                showToast(`Call ${data.status}`, 'info');
                endCall();
            }
        }
    });
}

function listenForIncomingCalls() {
    if (!currentUser) return;
    
    db.collection('calls')
        .where('receiverId', '==', currentUser.uid)
        .where('status', '==', 'ringing')
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const callData = change.doc.data();
                    
                    if (callActive) {
                        db.collection('calls').doc(change.doc.id).update({
                            status: 'busy'
                        });
                        return;
                    }
                    
                    incomingCallData = {
                        callId: change.doc.id,
                        ...callData
                    };
                    
                    document.getElementById('incoming-caller-name').innerText = callData.callerName || 'User';
                    document.getElementById('incoming-caller-pfp').src = callData.callerPhoto || `https://ui-avatars.com/api/?name=${(callData.callerName || 'U').charAt(0)}&background=4f46e5&color=fff`;
                    document.getElementById('incoming-call-type').innerText = callData.type === 'video' ? 'Video call' : 'Audio call';

                    playRingtone();
                    
                    document.getElementById('incoming-call-modal').classList.add('active');
                }
            });
        });
}

function playRingtone() {
    stopRingtone();
    callRingtone = new Audio('./sounds/messenger_video_call.mp3');
    callRingtone.loop = true;
    callRingtone.play().catch(e => console.log('Ringtone play failed:', e));
}

function stopRingtone() {
    if (callRingtone) {
        callRingtone.pause();
        callRingtone = null;
    }
}

async function acceptCall() {
    if (!incomingCallData) return;
    
    stopRingtone();
    document.getElementById('incoming-call-modal').classList.remove('active');
    
    currentCallType = incomingCallData.type;
    currentCallId = incomingCallData.callId;
    
    try {
        const constraints = {
            audio: true,
            video: currentCallType === 'video'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (currentCallType === 'video') {
            document.getElementById('local-video').srcObject = localStream;
            document.getElementById('video-container').style.display = 'block';
            document.getElementById('audio-container').style.display = 'none';
            document.getElementById('video-btn').style.display = 'flex';
        } else {
            document.getElementById('video-container').style.display = 'none';
            document.getElementById('audio-container').style.display = 'flex';
            document.getElementById('video-btn').style.display = 'none';
        }
        
        document.getElementById('call-user-name').innerText = incomingCallData.callerName || 'User';
        document.getElementById('call-user-pfp').src = incomingCallData.callerPhoto || `https://ui-avatars.com/api/?name=${(incomingCallData.callerName || 'U').charAt(0)}&background=4f46e5&color=fff`;
        document.getElementById('caller-avatar').src = incomingCallData.callerPhoto || `https://ui-avatars.com/api/?name=${(incomingCallData.callerName || 'U').charAt(0)}&background=4f46e5&color=fff`;
        document.getElementById('call-status').innerText = 'Connecting...';
        
        document.getElementById('call-modal').classList.add('active');

        peerConnection = new RTCPeerConnection(iceServers);

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = event => {
            remoteStream = event.streams[0];
            
            if (currentCallType === 'video') {
                document.getElementById('remote-video').srcObject = remoteStream;
            } 
            
            let audioElement = document.getElementById('remote-audio');
            if (!audioElement) {
                audioElement = document.createElement('audio');
                audioElement.id = 'remote-audio';
                audioElement.autoplay = true;
                audioElement.style.display = 'none';
                document.body.appendChild(audioElement);
            }
            
            audioElement.srcObject = remoteStream;
            audioElement.play().catch(e => console.log('Audio play error:', e));
            
            document.getElementById('call-status').innerText = 'Connected';
        };

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                sendCallCandidate(event.candidate);
            }
        };
        
        const offer = new RTCSessionDescription({
            type: incomingCallData.offer.type,
            sdp: incomingCallData.offer.sdp
        });
        
        await peerConnection.setRemoteDescription(offer);

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        await db.collection('calls').doc(currentCallId).update({
            answer: {
                type: answer.type,
                sdp: answer.sdp
            },
            status: 'connected',
            acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        startCallTimer();
        callActive = true;
        
    } catch (error) {
        console.error('Error accepting call:', error);
        showToast('Failed to accept call', 'error');
        endCall();
    }
}

async function declineCall() {
    stopRingtone();
    document.getElementById('incoming-call-modal').classList.remove('active');
    
    if (incomingCallData) {
        await db.collection('calls').doc(incomingCallData.callId).update({
            status: 'declined',
            endedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    incomingCallData = null;
    showToast('Call declined', 'info');
}

async function endCall() {
    const remoteAudio = document.getElementById('remote-audio');
    if (remoteAudio) {
        remoteAudio.srcObject = null;
        remoteAudio.remove();
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
    
    document.getElementById('call-modal').classList.remove('active');
    document.getElementById('incoming-call-modal').classList.remove('active');
    
    stopRingtone();

    if (currentCallId) {
        await db.collection('calls').doc(currentCallId).update({
            status: 'ended',
            endedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        currentCallId = null;
    }
    
    callActive = false;
    incomingCallData = null;
    showToast('Call ended', 'info');
}

function startCallTimer() {
    callStartTime = Date.now();
    callTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('call-duration').innerText = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.getElementById('mute-btn');
            if (audioTrack.enabled) {
                btn.innerHTML = '<i class="fas fa-microphone"></i>';
            } else {
                btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            }
        }
    }
}

function toggleVideo() {
    if (localStream && currentCallType === 'video') {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.getElementById('video-btn');
            if (videoTrack.enabled) {
                btn.innerHTML = '<i class="fas fa-video"></i>';
            } else {
                btn.innerHTML = '<i class="fas fa-video-slash"></i>';
            }
        }
    }
}

function toggleSpeaker() {
  
    showToast('Speaker toggled', 'info');
}

async function initializeGroupChat() {
    const gcRef = db.collection('groupChats').doc(GROUP_CHAT_ID);
    const gcDoc = await gcRef.get();
    
    if (!gcDoc.exists) {
        await gcRef.set({
            name: 'World Chat 🌏',
            description: 'Welcome to the group! 👋',
            photoURL: 'https://i.ibb.co/qYky078V/Screenshot-20260212-134936-1.jpg',
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            members: [currentUser.uid],
            memberCount: 1,
            pinnedMessage: null
        });
    } else {
        const members = gcDoc.data().members || [];
        if (!members.includes(currentUser.uid)) {
            await gcRef.update({
                members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
                memberCount: firebase.firestore.FieldValue.increment(1)
            });
        }
    }
    
    loadGCInfo();
    listenToGCMessages();
    listenToGCMembers();
    listenToPinnedMessage();
}

function loadGCInfo() {
    db.collection('groupChats').doc(GROUP_CHAT_ID).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();

            const gcNameElements = ['gc-name', 'sidebar-gc-name', 'display-gc-name'];
            gcNameElements.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = data.name || 'World Chat 🌏';
            });

            const descEl = document.getElementById('display-gc-desc');
            if (descEl) descEl.textContent = data.description || 'Welcome to the group! 👋';

            const gcPFP = data.photoURL || 'https://i.ibb.co/qYky078V/Screenshot-20260212-134936-1.jpg';
            const pfpElements = ['gc-pfp', 'sidebar-gc-pfp', 'modal-gc-pfp'];
            
            pfpElements.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.src = gcPFP;
                    el.onerror = function() {
                        this.onerror = null;
                        this.src = 'https://i.ibb.co/qYky078V/Screenshot-20260212-134936-1.jpg';
                    };
                }
            });

            const memberCount = data.members?.length || 0;
            const countElements = ['member-count', 'sidebar-member-count'];
            countElements.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = `${memberCount} members`;
            });

            if (data.createdAt) {
                const date = data.createdAt.toDate();
                const createdEl = document.getElementById('gc-created');
                if (createdEl) {
                    createdEl.textContent = date.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                    });
                }
            }
        }
    });
}

function listenToPinnedMessage() {
    db.collection('groupChats').doc(GROUP_CHAT_ID).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            const pinnedId = data.pinnedMessage;
            const pinnedEl = document.getElementById('pinned-message');
            const pinnedContent = document.getElementById('pinned-content');
            const pinnedModal = document.getElementById('pinned-text');
            
            if (pinnedId) {
                db.collection('groupChats').doc(GROUP_CHAT_ID)
                    .collection('messages').doc(pinnedId)
                    .get().then((msgDoc) => {
                        if (msgDoc.exists) {
                            const msg = msgDoc.data();
                            if (pinnedEl) {
                                pinnedEl.classList.remove('hidden');
                                pinnedContent.innerHTML = `<span>📌 ${escapeHTML(msg.text || 'Image message')}</span>`;
                            }
                            if (pinnedModal) {
                                pinnedModal.textContent = msg.text || 'Image message';
                            }
                            currentPinnedMessageId = pinnedId;
                        }
                    });
            } else {
                if (pinnedEl) pinnedEl.classList.add('hidden');
                if (pinnedModal) pinnedModal.textContent = 'No pinned message';
                currentPinnedMessageId = null;
            }
        }
    });
}

async function pinMessage(messageId, messageText) {
    if (!currentUser) return;
    
    try {
        await db.collection('groupChats').doc(GROUP_CHAT_ID).update({
            pinnedMessage: messageId,
            pinnedAt: firebase.firestore.FieldValue.serverTimestamp(),
            pinnedBy: currentUser.uid
        });
        showToast('📌 Message pinned!', 'success');
    } catch (error) {
        console.error('Error pinning message:', error);
        showToast('Failed to pin message', 'error');
    }
}

async function unpinMessage() {
    try {
        await db.collection('groupChats').doc(GROUP_CHAT_ID).update({
            pinnedMessage: null
        });
        showToast('📌 Message unpinned', 'info');
    } catch (error) {
        console.error('Error unpinning message:', error);
    }
}

function listenToGCMessages() {
    if (unsubscribeGC) unsubscribeGC();
    
    const messagesContainer = document.getElementById('gc-messages');
    if (!messagesContainer) return;

    messagesContainer.innerHTML = '';
    
    unsubscribeGC = db.collection('groupChats')
        .doc(GROUP_CHAT_ID)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {
            
            const allMessages = [];
            const userIds = new Set();
            
            snapshot.docs.forEach(doc => {
                const msg = doc.data();
                allMessages.push({
                    id: doc.id,
                    ...msg,
                    timestamp: msg.timestamp?.toDate().getTime() || 0
                });
                
                if (msg.senderId && msg.senderId !== currentUser?.uid) {
                    userIds.add(msg.senderId);
                }
            });
            
            allMessages.sort((a, b) => a.timestamp - b.timestamp);
            
            Promise.all(Array.from(userIds).map(userId => 
                db.collection('users').doc(userId).get()
            )).then(userDocs => {
                const userMap = {};
                userDocs.forEach(doc => {
                    if (doc.exists) userMap[doc.id] = doc.data();
                });
                
                messagesContainer.innerHTML = '';
                window.displayedGCMessageIds.clear();
                
                allMessages.forEach(msg => {
                    if (window.displayedGCMessageIds.has(msg.id)) return;
                    
                    window.displayedGCMessageIds.add(msg.id);
                    
                    if (msg.senderId === currentUser?.uid) {
                        appendGCMessage(msg, messagesContainer, {}, msg.id);
                    } else {
                        appendGCMessage(msg, messagesContainer, userMap, msg.id);
                    }
                });
                
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }).catch(error => {
                console.error('Error fetching users:', error);
                
                messagesContainer.innerHTML = '';
                window.displayedGCMessageIds.clear();
                
                allMessages.forEach(msg => {
                    window.displayedGCMessageIds.add(msg.id);
                    appendGCMessage(msg, messagesContainer, {}, msg.id);
                });
            });
            
        }, (error) => {
            console.error('Message listener error:', error);
            showToast('Reconnecting to chat...', 'info');
        });
}

function appendGCMessage(message, container, userMap = {}, messageId) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.senderId === currentUser?.uid ? 'sent' : 'received'}`;
    messageDiv.id = `msg-${messageId}`;

    let senderName = message.senderName || 'Unknown';
    let senderPhoto = message.senderPhoto || '';
    let senderId = message.senderId;

    if (message.senderId !== currentUser?.uid && userMap[message.senderId]) {
        senderName = userMap[message.senderId].name || senderName;
        senderPhoto = userMap[message.senderId].photoURL || senderPhoto;
        senderId = message.senderId;
    }

    const firstLetter = senderName.charAt(0).toUpperCase();
    const fallbackAvatar = `https://ui-avatars.com/api/?name=${firstLetter}&background=${message.senderId === currentUser?.uid ? '4f46e5' : '64748b'}&color=fff&size=100&bold=true`;

    const avatarUrl = senderPhoto || fallbackAvatar;
    
    const time = message.timestamp ? 
        new Date(message.timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }) : 'Just now';

    let contentHtml = '';
    
    if (message.type === 'image') {
        contentHtml = `<img src="${escapeHTML(message.imageUrl)}" class="message-image" alt="Shared image" onclick="openImage('${escapeHTML(message.imageUrl)}')">`;
    } else if (message.type === 'voice') {
        contentHtml = `
            <div class="voice-message" onclick='playVoiceMessage(\`${escapeHTML(message.audioData)}\`, "${messageId}", ${JSON.stringify(message.waveformData || [])})'>
                <div class="voice-play-icon">
                    <i class="fas fa-play"></i>
                </div>
                <div class="voice-waveform-small">
                    ${generateWaveformBars()}
                </div>
                <span class="voice-duration">${formatTime(message.duration || 0)}</span>
            </div>
        `;
    } else {
        contentHtml = `<div class="message-text">${formatMessageText(message.text || '')}</div>`;
    }

    let reactionsHtml = '';
    if (message.reactions) {
        const reactionCounts = {};
        Object.values(message.reactions).forEach(r => {
            reactionCounts[r] = (reactionCounts[r] || 0) + 1;
        });
        
        reactionsHtml = '<div class="message-reactions">';
        Object.entries(reactionCounts).forEach(([reaction, count]) => {
            reactionsHtml += `<span class="reaction-badge" onclick="showReactionViewers('${messageId}', '${reaction}', true)">${reaction} ${count}</span>`;
        });
        reactionsHtml += '</div>';
    }
    
    messageDiv.innerHTML = `
        <div class="message-avatar" onclick="showUserInfo('${message.senderId}')">
            <img src="${escapeHTML(avatarUrl)}" 
                 alt="${escapeHTML(senderName)}" 
                 loading="lazy"
                 onerror="this.onerror=null; this.src='${escapeHTML(fallbackAvatar)}';">
        </div>
        <div class="message-content">
            <div class="message-sender" onclick="showUserInfo('${message.senderId}')">${escapeHTML(message.senderId === currentUser?.uid ? 'You' : senderName)}</div>
            ${contentHtml}
            ${reactionsHtml}
            <div class="message-footer">
                <span class="message-time">${time}</span>
                <div class="message-actions">
                    <button onclick="showReactionPicker('${messageId}', true)" class="action-btn" title="React">
                        <i class="fas fa-smile"></i>
                    </button>
                    <button onclick="showForwardModal('${messageId}', '${escapeHTML(message.text || '')}', '${message.type || 'text'}', '${message.imageUrl || ''}')" class="action-btn" title="Forward">
                        <i class="fas fa-share"></i>
                    </button>
                    ${message.senderId === currentUser?.uid ? `
                        <button onclick="pinMessage('${messageId}', '${escapeHTML(message.text || '')}')" class="action-btn" title="Pin">
                            <i class="fas fa-thumbtack"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(messageDiv);
}

async function uploadImageMessage(isGC = true) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            showToast('📤 Uploading image...', 'info');
            const imageUrl = await uploadImageToIMGBB(file);
            
            if (isGC) {
                await db.collection('groupChats').doc(GROUP_CHAT_ID)
                    .collection('messages').add({
                        type: 'image',
                        imageUrl: imageUrl,
                        senderId: currentUser.uid,
                        senderName: currentUser.displayName || 'User',
                        senderPhoto: currentUser.photoURL || '',
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
            } else {
                if (!currentPMUser) {
                    showToast('Select a user first', 'error');
                    return;
                }
                const chatId = [currentUser.uid, currentPMUser.id].sort().join('_');
                await db.collection('privateChats').doc(chatId)
                    .collection('messages').add({
                        type: 'image',
                        imageUrl: imageUrl,
                        senderId: currentUser.uid,
                        senderName: currentUser.displayName || 'You',
                        senderPhoto: currentUser.photoURL || '',
                        receiverId: currentPMUser.id,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        read: false
                    });
            }
            showToast('✅ Image sent!', 'success');
        } catch (error) {
            console.error('Error uploading image:', error);
            showToast('Failed to upload image', 'error');
        }
    };
    input.click();
}

function openImage(url) {
    window.open(url, '_blank');
}

function showReactionPicker(messageId, isGC = true) {
    currentMessageForReaction = { messageId, isGC };
    const modal = document.getElementById('reaction-modal');
    if (modal) modal.classList.add('active');
}

async function addReaction(reaction) {
    if (!currentMessageForReaction) return;
    
    const { messageId, isGC } = currentMessageForReaction;
    
    try {
        let chatId = '';
        if (!isGC && currentPMUser) {
            chatId = [currentUser.uid, currentPMUser.id].sort().join('_');
        }
        
        const collection = isGC ?
            db.collection('groupChats').doc(GROUP_CHAT_ID).collection('messages') :
            db.collection('privateChats').doc(chatId).collection('messages');
        
        await collection.doc(messageId).update({
            [`reactions.${currentUser.uid}`]: reaction
        }, { merge: true });
        
        showToast(`Reacted ${reaction}`, 'success');
    } catch (error) {
        console.error('Error adding reaction:', error);
        showToast('Failed to add reaction', 'error');
    }
    
    closeModal('reaction-modal');
    currentMessageForReaction = null;
}

async function showForwardModal(messageId, text, type, imageUrl) {
    currentMessageForForward = { messageId, text, type, imageUrl };

    const usersList = document.getElementById('forward-users-list');
    if (!usersList) return;
    
    const snapshot = await db.collection('users').get();
    usersList.innerHTML = '';
    
    snapshot.forEach(doc => {
        if (doc.id !== currentUser.uid) {
            const user = doc.data();
            const userDiv = document.createElement('div');
            userDiv.className = 'user-item';
            userDiv.onclick = () => forwardMessageToUser(doc.id, user.name);
            userDiv.innerHTML = `
                <div class="user-item-avatar">
                    <img src="${user.photoURL || `https://ui-avatars.com/api/?name=${user.name?.charAt(0) || 'U'}&background=4f46e5&color=fff&size=100`}">
                </div>
                <div class="user-item-info">
                    <div class="user-item-name">${escapeHTML(user.name || 'User')}</div>
                </div>
            `;
            usersList.appendChild(userDiv);
        }
    });

    const preview = document.getElementById('forward-message-preview');
    if (preview) {
        if (type === 'image') {
            preview.innerHTML = `<img src="${imageUrl}" class="forward-preview-image">`;
        } else {
            preview.innerHTML = `<p>${escapeHTML(text)}</p>`;
        }
    }
    
    const modal = document.getElementById('forward-modal');
    if (modal) modal.classList.add('active');
}

async function forwardMessageToUser(userId, userName) {
    if (!currentMessageForForward) return;
    
    const { text, type, imageUrl } = currentMessageForForward;
    const chatId = [currentUser.uid, userId].sort().join('_');
    
    try {
        await db.collection('privateChats').doc(chatId)
            .collection('messages').add({
                text: type === 'image' ? '📷 Image' : text,
                type: type,
                imageUrl: imageUrl,
                senderId: currentUser.uid,
                senderName: currentUser.displayName || 'You',
                senderPhoto: currentUser.photoURL || '',
                receiverId: userId,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                read: false,
                forwarded: true,
                forwardedFrom: currentPMUser?.name || 'Unknown'
            });
        
        showToast(`✅ Forwarded to ${userName}`, 'success');
        closeModal('forward-modal');
    } catch (error) {
        console.error('Error forwarding message:', error);
        showToast('Failed to forward message', 'error');
    }
}

function toggleSearch() {
    const searchBar = document.getElementById('search-bar');
    if (searchBar) {
        searchBar.classList.toggle('hidden');
        if (!searchBar.classList.contains('hidden')) {
            document.getElementById('search-input')?.focus();
        } else {
            document.getElementById('search-results')?.classList.add('hidden');
        }
    }
}

function closeSearch() {
    const searchBar = document.getElementById('search-bar');
    const searchResults = document.getElementById('search-results');
    if (searchBar) searchBar.classList.add('hidden');
    if (searchResults) searchResults.classList.add('hidden');
}

function setupSearchListener() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            document.getElementById('search-results')?.classList.add('hidden');
            return;
        }
        
        searchTimeout = setTimeout(() => {
            performSearch(query);
        }, 500);
    });
}

async function performSearch(query) {
    if (!currentUser) return;
    
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '<div class="search-loading">Searching...</div>';
    resultsContainer.classList.remove('hidden');
    
    try {
        const gcSnapshot = await db.collection('groupChats').doc(GROUP_CHAT_ID)
            .collection('messages')
            .where('text', '>=', query)
            .where('text', '<=', query + '\uf8ff')
            .orderBy('text')
            .limit(10)
            .get();
        
        let results = [];
        gcSnapshot.forEach(doc => {
            results.push({
                ...doc.data(),
                id: doc.id,
                chatType: 'Group Chat'
            });
        });
        
        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No messages found</div>';
        } else {
            resultsContainer.innerHTML = '<h4>Search Results</h4>';
            results.forEach(msg => {
                const resultDiv = document.createElement('div');
                resultDiv.className = 'search-result-item';
                resultDiv.onclick = () => scrollToMessage(msg.id);
                resultDiv.innerHTML = `
                    <div class="search-result-sender">${escapeHTML(msg.senderName || 'User')}</div>
                    <div class="search-result-text">${escapeHTML(msg.text || '')}</div>
                    <div class="search-result-time">${msg.chatType}</div>
                `;
                resultsContainer.appendChild(resultDiv);
            });
        }
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = '<div class="search-error">Search failed</div>';
    }
}

function toggleTheme() {
    const body = document.body;
    const themeBtn = document.querySelector('.theme-btn i');
    
    if (body.classList.contains('light-mode')) {
        body.classList.remove('light-mode');
        localStorage.setItem('messenger-theme', 'dark');
        if (themeBtn) {
            themeBtn.classList.remove('fa-sun');
            themeBtn.classList.add('fa-moon');
        }
    } else {
        body.classList.add('light-mode');
        localStorage.setItem('messenger-theme', 'light');
        if (themeBtn) {
            themeBtn.classList.remove('fa-moon');
            themeBtn.classList.add('fa-sun');
        }
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('messenger-theme') || 'dark';
    const body = document.body;
    const themeBtn = document.querySelector('.theme-btn i');
    
    if (savedTheme === 'light') {
        body.classList.add('light-mode');
        if (themeBtn) {
            themeBtn.classList.remove('fa-moon');
            themeBtn.classList.add('fa-sun');
        }
    }
}

let typingTimeout = null;
let typingListener = null;

function setupTypingListener() {
    const pmInput = document.getElementById('pm-message-input');
    if (!pmInput) return;
    
    pmInput.addEventListener('input', () => {
        if (!currentPMUser) return;
        sendTypingIndicator();
    });
}

async function sendTypingIndicator() {
    if (!currentPMUser) return;
    
    const chatId = [currentUser.uid, currentPMUser.id].sort().join('_');
    
    try {
        await db.collection('privateChats').doc(chatId).update({
            [`typing.${currentUser.uid}`]: true,
            [`typingTimestamp.${currentUser.uid}`]: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(async () => {
            await db.collection('privateChats').doc(chatId).update({
                [`typing.${currentUser.uid}`]: false
            });
        }, 2000);
    } catch (error) {
        console.error('Error sending typing indicator:', error);
    }
}

function listenToTypingIndicator(userId) {
    if (typingListener) typingListener();
    
    const chatId = [currentUser.uid, userId].sort().join('_');
    
    typingListener = db.collection('privateChats').doc(chatId)
        .onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                const isTyping = data.typing?.[userId] || false;
                const typingEl = document.getElementById('typing-indicator');
                
                if (typingEl) {
                    if (isTyping) {
                        typingEl.classList.remove('hidden');
                    } else {
                        typingEl.classList.add('hidden');
                    }
                }
            }
        });
}

function loadUsers() {
    if (unsubscribeUsers) unsubscribeUsers();
    
    unsubscribeUsers = db.collection('users')
        .onSnapshot((snapshot) => {
            const users = [];
            snapshot.forEach((doc) => {
                if (doc.id !== currentUser?.uid) {
                    users.push({ 
                        id: doc.id, 
                        ...doc.data(),
                        unreadCount: 0 
                    });
                }
            });

            users.sort((a, b) => {
                if (a.online && !b.online) return -1;
                if (!a.online && b.online) return 1;
                return (a.name || '').localeCompare(b.name || '');
            });
            
            displayUsers(users);
            displaySidebarUsers(users);
            
            const onlineCount = document.getElementById('online-count');
            if (onlineCount) {
                const onlineUsers = users.filter(u => u.online).length;
                onlineCount.textContent = onlineUsers;
            }
        });
}

function displayUsers(users) {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    usersList.innerHTML = '';
    
    if (users.length === 0) {
        usersList.innerHTML = '<div class="no-users">No other users online</div>';
        return;
    }
    
    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.setAttribute('data-user-id', user.id);
        userDiv.onclick = () => openPrivateChat(user);

        const firstLetter = (user.name || 'User').charAt(0).toUpperCase();
        const fallbackAvatar = `https://ui-avatars.com/api/?name=${firstLetter}&background=4f46e5&color=fff&size=100&bold=true`;
        const avatarUrl = user.photoURL || fallbackAvatar;
        
        const statusClass = user.online ? 'online' : 'offline';
        const statusText = user.online ? '● Online' : formatLastSeen(user.lastSeen);
        
        userDiv.innerHTML = `
            <div class="user-item-avatar">
                <img src="${escapeHTML(avatarUrl)}" 
                     alt="${escapeHTML(user.name || 'User')}"
                     loading="lazy"
                     onerror="this.onerror=null; this.src='${escapeHTML(fallbackAvatar)}';">
                <span class="status-indicator ${statusClass}"></span>
            </div>
            <div class="user-item-info">
                <div class="user-item-name">${escapeHTML(user.name || 'User')}</div>
                <div class="user-item-status ${statusClass}">${statusText}</div>
            </div>
        `;
        
        usersList.appendChild(userDiv);
    });
}

function displaySidebarUsers(users) {
    const sidebarUsers = document.getElementById('sidebar-users-list');
    if (!sidebarUsers) return;
    
    sidebarUsers.innerHTML = '';
    
    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'sidebar-user-item user-item';
        userDiv.setAttribute('data-user-id', user.id);
        userDiv.onclick = () => {
            openPrivateChat(user);
            toggleSidebar();
        };
        
        const firstLetter = (user.name || 'User').charAt(0).toUpperCase();
        const fallbackAvatar = `https://ui-avatars.com/api/?name=${firstLetter}&background=4f46e5&color=fff&size=100&bold=true`;
        const avatarUrl = user.photoURL || fallbackAvatar;
        
        const statusClass = user.online ? 'online' : 'offline';
        const statusText = user.online ? '● Online' : formatLastSeen(user.lastSeen);
        
        userDiv.innerHTML = `
            <div class="user-item-avatar">
                <img src="${escapeHTML(avatarUrl)}" 
                     alt="${escapeHTML(user.name || 'User')}"
                     loading="lazy"
                     onerror="this.onerror=null; this.src='${escapeHTML(fallbackAvatar)}';">
                <span class="status-indicator ${statusClass}"></span>
            </div>
            <div class="user-item-info">
                <div class="user-item-name">${escapeHTML(user.name || 'User')}</div>
                <div class="user-item-status ${statusClass}">${statusText}</div>
            </div>
        `;
        
        sidebarUsers.appendChild(userDiv);
    });
}

function formatLastSeen(timestamp) {
    if (!timestamp) return '○ Offline';
    if (!timestamp.toDate) return '○ Offline';
    
    const lastSeen = timestamp.toDate();
    const now = new Date();
    const diffSeconds = Math.floor((now - lastSeen) / 1000);
    
    if (diffSeconds < 60) return '○ Just now';
    if (diffSeconds < 3600) return `○ ${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `○ ${Math.floor(diffSeconds / 3600)}h ago`;
    if (diffSeconds < 604800) return `○ ${Math.floor(diffSeconds / 86400)}d ago`;
    
    return '○ Offline';
}

function listenToUnreadPMs() {
    if (!currentUser) return;
    
    if (unsubscribeUnreadPMs) unsubscribeUnreadPMs();

    unsubscribeUnreadPMs = db.collectionGroup('messages')
        .where('receiverId', '==', currentUser.uid)
        .where('read', '==', false)
        .onSnapshot((snapshot) => {
            const unreadMap = new Map();
            
            snapshot.forEach(doc => {
                const msg = doc.data();
                const senderId = msg.senderId;
                unreadMap.set(senderId, (unreadMap.get(senderId) || 0) + 1);
            });

            document.querySelectorAll('.user-item-avatar .unread-badge').forEach(badge => {
                badge.remove();
            });

            if (unreadMap.size === 0) {
                document.title = 'Mini Messenger';
            } else {
                unreadMap.forEach((count, senderId) => {
                    updateUserUnreadBadge(senderId, count);
                });
                
                const totalUnread = Array.from(unreadMap.values()).reduce((a, b) => a + b, 0);
                document.title = `(${totalUnread}) Mini Messenger`;
            }

            saveUnreadCounts(unreadMap);
            
        }, (error) => {
            console.error('❌ Unread messages listener error:', error);
            loadSavedUnreadCounts();
        });
}

function saveUnreadCounts(unreadMap) {
    try {
        const unreadData = {};
        unreadMap.forEach((count, senderId) => {
            unreadData[senderId] = count;
        });
        localStorage.setItem('messenger_unread', JSON.stringify(unreadData));
    } catch (e) {
        console.log('Error saving to localStorage:', e);
    }
}

function loadSavedUnreadCounts() {
    try {
        const saved = localStorage.getItem('messenger_unread');
        if (saved) {
            const unreadData = JSON.parse(saved);
            Object.entries(unreadData).forEach(([senderId, count]) => {
                updateUserUnreadBadge(senderId, count);
            });
        }
    } catch (e) {
        console.log('Error loading from localStorage:', e);
    }
}

function updateUserUnreadBadge(userId, count) {
    const userItems = document.querySelectorAll(`.user-item[data-user-id="${userId}"]`);
    
    userItems.forEach(item => {
        const avatarContainer = item.querySelector('.user-item-avatar');
        if (!avatarContainer) return;

        const existingBadge = avatarContainer.querySelector('.unread-badge');
        if (existingBadge) existingBadge.remove();

        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'unread-badge';
            badge.textContent = count > 99 ? '99+' : count;
            avatarContainer.appendChild(badge);
        }
    });
}

async function openPrivateChat(user) {
    if (!user) return;

    window.displayedPMMessageIds.clear();
    
    currentPMUser = user;
    await markMessagesAsRead(user.id);
    resetPMNotifications(user.id);
    
    const pmNameEl = document.getElementById('pm-user-name');
    const pmPfpEl = document.getElementById('pm-user-pfp');
    
    if (pmNameEl) pmNameEl.textContent = user.name || 'User';

    if (pmPfpEl) {
        const firstLetter = (user.name || 'User').charAt(0).toUpperCase();
        const fallbackAvatar = `https://ui-avatars.com/api/?name=${firstLetter}&background=4f46e5&color=fff&size=100&bold=true`;
        const avatarUrl = user.photoURL || fallbackAvatar;
        
        pmPfpEl.src = avatarUrl;
        pmPfpEl.onerror = function() {
            this.onerror = null;
            this.src = fallbackAvatar;
        };
    }
    
    const usersList = document.getElementById('users-list');
    const pmChatArea = document.getElementById('pm-chat-area');
    
    if (usersList) usersList.classList.add('hidden');
    if (pmChatArea) pmChatArea.classList.remove('hidden');
    
    listenToPMMessages(user.id);
    listenToTypingIndicator(user.id);
}

function closePM() {
    currentPMUser = null;

    window.displayedPMMessageIds.clear();
    
    const usersList = document.getElementById('users-list');
    const pmChatArea = document.getElementById('pm-chat-area');
    
    if (usersList) usersList.classList.remove('hidden');
    if (pmChatArea) pmChatArea.classList.add('hidden');
    
    if (unsubscribePM) unsubscribePM();
    if (typingListener) typingListener();
}

function listenToPMMessages(otherUserId) {
    if (unsubscribePM) unsubscribePM();
    
    const messagesContainer = document.getElementById('pm-messages');
    if (!messagesContainer) return;

    messagesContainer.innerHTML = '';
    
    const chatId = [currentUser.uid, otherUserId].sort().join('_');
    
    unsubscribePM = db.collection('privateChats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {

            snapshot.docChanges().forEach((change) => {
                const message = change.doc.data();
                const messageId = change.doc.id;
                
                if (change.type === 'added') {
                    if (window.displayedPMMessageIds.has(messageId)) {
                        console.log('Skipping duplicate PM message:', messageId);
                        return;
                    }
                    
                    window.displayedPMMessageIds.add(messageId);

                    appendPMMessage(message, messagesContainer, messageId);
                }
                
                if (change.type === 'modified') {
                    const existingMsg = document.getElementById(`pm-msg-${messageId}`);
                    if (existingMsg) {
                        existingMsg.remove();
                        window.displayedPMMessageIds.delete(messageId);
                        
                        window.displayedPMMessageIds.add(messageId);
                        appendPMMessage(message, messagesContainer, messageId);
                    }
                }
                
                if (change.type === 'removed') {
                    const existingMsg = document.getElementById(`pm-msg-${messageId}`);
                    if (existingMsg) {
                        existingMsg.remove();
                        window.displayedPMMessageIds.delete(messageId);
                    }
                }
            });
            
            if (snapshot.docChanges().length > 0) {
                const lastChange = snapshot.docChanges()[snapshot.docChanges().length - 1];
                if (lastChange.type === 'added' && lastChange.doc.data().senderId === currentUser?.uid) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                } else {
                    const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
                    if (isNearBottom) {
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                }
            }

            if (messagesContainer.children.length === 0) {
                messagesContainer.innerHTML = '<div class="no-messages">💬 No messages yet. Say hi!</div>';
            }
            
            if (currentPMUser?.id === otherUserId) {
                markMessagesAsRead(otherUserId);
            }
        });
}

function appendPMMessage(message, container, messageId) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.senderId === currentUser?.uid ? 'sent' : 'received'}`;
    messageDiv.id = `pm-msg-${messageId}`;
    
    const isSentByMe = message.senderId === currentUser?.uid;
    
    let senderName, senderPhoto, senderFirstLetter, senderId;
    
    if (isSentByMe) {
        senderName = 'You';
        senderFirstLetter = (currentUser?.displayName || 'U').charAt(0).toUpperCase();
        senderPhoto = currentUser?.photoURL || '';
        senderId = currentUser?.uid;
    } else {
        senderName = currentPMUser?.name || 'User';
        senderFirstLetter = (currentPMUser?.name || 'U').charAt(0).toUpperCase();
        senderPhoto = currentPMUser?.photoURL || '';
        senderId = currentPMUser?.id;
    }
    
    const fallbackAvatar = `https://ui-avatars.com/api/?name=${senderFirstLetter}&background=${isSentByMe ? '4f46e5' : '64748b'}&color=fff&size=100&bold=true`;
    const avatarUrl = senderPhoto || fallbackAvatar;
    
    const time = message.timestamp ? 
        new Date(message.timestamp.toDate()).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }) : 'Just now';

    let forwardIndicator = '';
    if (message.forwarded) {
        forwardIndicator = '<span class="forward-indicator"><i class="fas fa-share"></i> Forwarded</span>';
    }

    let contentHtml = '';
    
    if (message.type === 'image') {
        contentHtml = `<img src="${escapeHTML(message.imageUrl)}" class="message-image" alt="Shared image" onclick="openImage('${escapeHTML(message.imageUrl)}')">`;
    } else if (message.type === 'voice') {
        contentHtml = `
            <div class="voice-message" onclick='playVoiceMessage(\`${escapeHTML(message.audioData)}\`, "${messageId}", ${JSON.stringify(message.waveformData || [])})'>
                <div class="voice-play-icon">
                    <i class="fas fa-play"></i>
                </div>
                <div class="voice-waveform-small">
                    ${generateWaveformBars()}
                </div>
                <span class="voice-duration">${formatTime(message.duration || 0)}</span>
            </div>
        `;
    } else {
        contentHtml = `<div class="message-text">${formatMessageText(message.text || '')}</div>`;
    }

    let reactionsHtml = '';
    if (message.reactions) {
        const reactionCounts = {};
        Object.values(message.reactions).forEach(r => {
            reactionCounts[r] = (reactionCounts[r] || 0) + 1;
        });
        
        reactionsHtml = '<div class="message-reactions">';
        Object.entries(reactionCounts).forEach(([reaction, count]) => {
            reactionsHtml += `<span class="reaction-badge" onclick="showReactionViewers('${messageId}', '${reaction}', false)">${reaction} ${count}</span>`;
        });
        reactionsHtml += '</div>';
    }
    
    let readStatus = '';
    if (isSentByMe) {
        readStatus = message.read 
            ? '<span class="status-read" title="Read"><i class="fas fa-check-double"></i></span>' 
            : '<span class="status-sent" title="Sent"><i class="fas fa-check"></i></span>';
    }
    
    messageDiv.innerHTML = `
        <div class="message-avatar" onclick="showUserInfo('${senderId}')">
            <img src="${escapeHTML(avatarUrl)}" 
                 alt="${escapeHTML(senderName)}"
                 loading="lazy"
                 onerror="this.onerror=null; this.src='${escapeHTML(fallbackAvatar)}';">
        </div>
        <div class="message-content">
            <div class="message-sender" onclick="showUserInfo('${senderId}')">${escapeHTML(senderName)}</div>
            ${forwardIndicator}
            ${contentHtml}
            ${reactionsHtml}
            <div class="message-footer">
                <span class="message-time">${time}</span>
                ${readStatus}
                ${!isSentByMe ? `
                    <div class="message-actions">
                        <button onclick="showReactionPicker('${messageId}', false)" class="action-btn" title="React">
                            <i class="fas fa-smile"></i>
                        </button>
                        <button onclick="showForwardModal('${messageId}', '${escapeHTML(message.text || '')}', '${message.type || 'text'}', '${message.imageUrl || ''}')" class="action-btn" title="Forward">
                            <i class="fas fa-share"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    container.appendChild(messageDiv);
}

async function sendPM() {
    if (!currentPMUser) {
        showToast('Select a user first', 'error');
        return;
    }
    
    const input = document.getElementById('pm-message-input');
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) {
        showToast('Please type a message', 'error');
        return;
    }
    
    input.disabled = true;
    const sendBtn = document.querySelector('#pm-view .send-btn');
    if (sendBtn) {
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;
    }
    
    const messageText = input.value;
    input.value = '';
    
    try {
        const chatId = [currentUser.uid, currentPMUser.id].sort().join('_');

        await db.collection('privateChats')
            .doc(chatId)
            .collection('messages')
            .add({
                text: messageText,
                senderId: currentUser.uid,
                senderName: currentUser.displayName || 'You',
                senderPhoto: currentUser.photoURL || '',
                receiverId: currentPMUser.id,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                read: false 
            });
        
    } catch (error) {
        console.error('❌ Error sending PM:', error);
        showToast('Failed to send message', 'error');
        input.value = messageText;
    } finally {
        input.disabled = false;
        input.focus();
        if (sendBtn) {
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            sendBtn.disabled = false;
        }
    }
}

async function sendGCMessage() {
    const input = document.getElementById('gc-message-input');
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) {
        showToast('Please type a message', 'error');
        return;
    }
    
    if (!currentUser) {
        showToast('You are not logged in', 'error');
        return;
    }

    input.disabled = true;
    const sendBtn = document.querySelector('#gc-view .send-btn');
    if (sendBtn) {
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;
    }

    input.value = '';
    
    try {
        const gcRef = db.collection('groupChats').doc(GROUP_CHAT_ID);
        
        await gcRef.collection('messages').add({
            text: text,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || currentUser.email.split('@')[0] || 'User',
            senderPhoto: currentUser.photoURL || '',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
    } catch (error) {
        console.error('❌ Error sending message:', error);
        showToast('Failed to send message', 'error');
        input.value = text;
    } finally {
        input.disabled = false;
        input.focus();
        if (sendBtn) {
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            sendBtn.disabled = false;
        }
    }
}

async function markMessagesAsRead(senderId) {
    if (!currentUser || !senderId) return;
    
    const chatId = [currentUser.uid, senderId].sort().join('_');
    
    try {
        const messagesRef = db.collection('privateChats')
            .doc(chatId)
            .collection('messages')
            .where('receiverId', '==', currentUser.uid)
            .where('read', '==', false);
        
        const snapshot = await messagesRef.get();
        
        if (snapshot.size > 0) {
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, { 
                    read: true,
                    readAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            
            await batch.commit();
            
            
            updateUserUnreadBadge(senderId, 0);
            
            
            const saved = localStorage.getItem('messenger_unread');
            if (saved) {
                const unreadData = JSON.parse(saved);
                delete unreadData[senderId];
                localStorage.setItem('messenger_unread', JSON.stringify(unreadData));
            }
            
        
            const totalUnread = getTotalUnreadCount();
            document.title = totalUnread > 0 ? `(${totalUnread}) Mini Messenger` : 'Mini Messenger';
        }
        
    } catch (error) {
        console.error('❌ Error marking messages as read:', error);
    }
}

function resetPMNotifications(senderId) {
    updateUserUnreadBadge(senderId, 0);
    const totalUnread = getTotalUnreadCount();
    document.title = totalUnread > 0 ? `(${totalUnread}) Mini Messenger` : 'Mini Messenger';
}

function resetGCNotifications() {
    const totalUnread = getTotalUnreadCount();
    document.title = totalUnread > 0 ? `(${totalUnread}) Mini Messenger` : 'Mini Messenger';
}

function getTotalUnreadCount() {
    let total = 0;
    const badges = document.querySelectorAll('.user-item-avatar .unread-badge');
    badges.forEach(badge => {
        const count = badge.textContent;
        if (count === '99+') {
            total += 99;
        } else {
            total += parseInt(count) || 0;
        }
    });
    return total;
}

async function uploadImageToIMGBB(file) {
    return new Promise((resolve, reject) => {
        if (isUploading) {
            reject('Upload already in progress');
            return;
        }
        
        isUploading = true;
        
        if (!file) {
            isUploading = false;
            reject('No file selected');
            return;
        }
        
        if (!file.type.match('image.*')) {
            isUploading = false;
            showToast('Please select an image file', 'error');
            reject('Invalid file type');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            isUploading = false;
            showToast('File too large. Max 5MB', 'error');
            reject('File too large');
            return;
        }
        
        const formData = new FormData();
        formData.append('image', file);
        
        fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            isUploading = false;
            
            if (data.success) {
                resolve(data.data.url);
            } else {
                showToast('❌ Upload failed', 'error');
                reject(data.error);
            }
        })
        .catch(error => {
            isUploading = false;
            console.error('Upload error:', error);
            showToast('❌ Upload failed', 'error');
            reject(error);
        });
    });
}

async function changeGCPFP() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const imageUrl = await uploadImageToIMGBB(file);
            await db.collection('groupChats').doc(GROUP_CHAT_ID).update({
                photoURL: imageUrl,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast('✅ Group photo updated!', 'success');
        } catch (error) {
            console.error('Error updating GC photo:', error);
            showToast('❌ Failed to update group photo', 'error');
        }
    };
    input.click();
}

async function changeProfilePicture() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const imageUrl = await uploadImageToIMGBB(file);
            
            await db.collection('users').doc(currentUser.uid).update({
                photoURL: imageUrl,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            await currentUser.updateProfile({
                photoURL: imageUrl
            });
            
            const userPfpEl = document.getElementById('current-user-pfp');
            if (userPfpEl) userPfpEl.src = imageUrl;
            
            showToast('✅ Profile picture updated!', 'success');
        } catch (error) {
            console.error('Error updating profile:', error);
            showToast('❌ Failed to update profile picture', 'error');
        }
    };
    input.click();
}

function listenToGCMembers() {
    if (unsubscribeMembers) unsubscribeMembers();
    
    unsubscribeMembers = db.collection('groupChats')
        .doc(GROUP_CHAT_ID)
        .onSnapshot(async (doc) => {
            if (doc.exists) {
                const members = doc.data().members || [];
                const membersList = document.getElementById('members-list');
                if (!membersList) return;
                
                membersList.innerHTML = '';
                
                for (const memberId of members) {
                    const userDoc = await db.collection('users').doc(memberId).get();
                    if (userDoc.exists) {
                        const user = userDoc.data();
                        const firstLetter = (user.name || 'User').charAt(0).toUpperCase();
                        const fallbackAvatar = `https://ui-avatars.com/api/?name=${firstLetter}&background=4f46e5&color=fff&size=100&bold=true`;
                        const avatarUrl = user.photoURL || fallbackAvatar;
                        
                        const memberDiv = document.createElement('div');
                        memberDiv.className = 'member-item';
                        memberDiv.onclick = () => showUserInfo(memberId);
                        memberDiv.innerHTML = `
                            <div class="member-avatar">
                                <img src="${escapeHTML(avatarUrl)}" 
                                     alt="${escapeHTML(user.name || 'User')}"
                                     loading="lazy"
                                     onerror="this.onerror=null; this.src='${escapeHTML(fallbackAvatar)}';">
                            </div>
                            <div class="member-info">
                                <div class="member-name">${escapeHTML(user.name || 'User')}</div>
                                <div class="member-role">${memberId === currentUser?.uid ? '👑 You' : '👤 Member'}</div>
                            </div>
                        `;
                        membersList.appendChild(memberDiv);
                    }
                }
            }
        });
}

async function editGCName() {
    const currentName = document.getElementById('display-gc-name')?.textContent || 'World Chat 🌏';
    const newName = prompt('Enter new group name:', currentName);
    if (newName?.trim()) {
        await db.collection('groupChats').doc(GROUP_CHAT_ID).update({
            name: newName.trim()
        });
        showToast('✅ Group name updated!', 'success');
    }
}

async function editGCDesc() {
    const currentDesc = document.getElementById('display-gc-desc')?.textContent || 'Welcome to the group! 👋';
    const newDesc = prompt('Enter new group description:', currentDesc);
    if (newDesc?.trim()) {
        await db.collection('groupChats').doc(GROUP_CHAT_ID).update({
            description: newDesc.trim()
        });
        showToast('✅ Description updated!', 'success');
    }
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    
    toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatMessageText(text) {
    if (!text) return '';
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    text = text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="message-link">$1</a>');
    text = text.replace(/\n/g, '<br>');
    
    const emojiMap = {
        ':)': '😊', ':(': '😢', ':D': '😃', ';)': '😉',
        '<3': '❤️', 'lol': '😂', 'omg': '😱', ':p': '😋'
    };
    
    Object.keys(emojiMap).forEach(key => {
        const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        text = text.replace(regex, emojiMap[key]);
    });
    
    return text;
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupEnterKeyListeners() {
    const gcInput = document.getElementById('gc-message-input');
    if (gcInput) {
        gcInput.removeEventListener('keypress', handleGCEnterKey);
        gcInput.addEventListener('keypress', handleGCEnterKey);
    }
    
    const pmInput = document.getElementById('pm-message-input');
    if (pmInput) {
        pmInput.removeEventListener('keypress', handlePMEnterKey);
        pmInput.addEventListener('keypress', handlePMEnterKey);
    }
}

function handleGCEnterKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendGCMessage();
    }
}

function handlePMEnterKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendPM();
    }
}

function switchTab(tab) {
    const gcTab = document.getElementById('gc-tab');
    const pmTab = document.getElementById('pm-tab');
    const gcView = document.getElementById('gc-view');
    const pmView = document.getElementById('pm-view');
    
    if (gcTab) gcTab.classList.toggle('active', tab === 'gc');
    if (pmTab) pmTab.classList.toggle('active', tab === 'pm');
    if (gcView) gcView.classList.toggle('active', tab === 'gc');
    if (pmView) pmView.classList.toggle('active', tab === 'pm');

    if (tab === 'gc') resetGCNotifications();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

function showGCInfo() {
    const modal = document.getElementById('gc-info-modal');
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function setupPresence() {
    window.addEventListener('beforeunload', () => {
        if (currentUser) {
            db.collection('users').doc(currentUser.uid).update({
                online: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    });
}

async function logout() {
    try {
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid).update({
                online: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        await firebase.auth().signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = 'login.html';
    }
}

setTimeout(() => {
    setupSearchListener();
    setupTypingListener();
}, 2000);

async function testMessenger() {
    console.log('🔍 TESTING MINI MESSENGER...');
    console.log('User:', currentUser?.email);
    console.log('Firebase:', !!db);
    console.log('IMGBB Key:', IMGBB_API_KEY ? '✅' : '❌');
    
    try {
        await db.collection('test').doc('test').set({ test: Date.now() });
        console.log('✅ Firestore write OK');
        const testDoc = await db.collection('test').doc('test').get();
        console.log('✅ Firestore read OK');
        showToast('✅ Messenger is working!', 'success');
    } catch (error) {
        console.error('❌ Firestore error:', error);
        showToast('❌ Connection error', 'error');
    }
}

setTimeout(testMessenger, 3000);
