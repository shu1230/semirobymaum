document.addEventListener('DOMContentLoaded', () => {

    // Firebase 데이터베이스 URL 설정 (슬래시 오타 수정)
    const DB_BASE = "https://newmiro-f6e71-default-rtdb.asia-southeast1.firebasedatabase.app/";
    const DB_API_URL = DB_BASE + "/messages.json";
    const SETTINGS_URL = DB_BASE + "/settings.json";

    const DEFAULT_SETTINGS = { nickname: '새미로', overlay: 'none', profileImg: '', chatBg: '', homeBg: '' };
    const OVERLAY_SRC = { snow: 'snow.mp4', sakura: 'cherry.mp4' };
    const initialMessages = [];

    let currentMode = "fan";
    let selectedReplyMessageId = null;
    let pendingReplyTargetId = null;
    let messages = [];
    let isSearchMode = false;
    let searchMatches = [];
    let currentSearchIndex = -1;
    let settings = { ...DEFAULT_SETTINGS };
    let pendingDeleteMsg = null;
    let suppressClickUntil = 0;

    // DOM Elements
    const screenHome = document.getElementById('screen-home');
    const screenChat = document.getElementById('screen-chat');
    const btnEnterChat = document.getElementById('btn-enter-chat');
    const btnBackHome = document.getElementById('btn-back-home');

    const btnOpenSearch = document.getElementById('btn-open-search');
    const btnCloseSearch = document.getElementById('btn-close-search');
    const btnCancelSearch = document.getElementById('btn-cancel-search');
    const searchInput = document.getElementById('search-input');

    const btnOpenMenu = document.getElementById('btn-open-menu');
    const chatMenuDropdown = document.getElementById('chat-menu-dropdown');
    const menuOptAuth = document.getElementById('menu-opt-auth');

    const chatMessagesContainer = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send');

    // 이미지 관련 DOM 요소
    const imageInput = document.getElementById('image-input');
    const btnAttachImage = document.getElementById('btn-attach-image');

    const replyPreviewBar = document.getElementById('reply-preview-bar');
    const replyPreviewText = document.getElementById('reply-preview-text');
    const btnCancelReply = document.getElementById('btn-cancel-reply');

    const searchNavBar = document.getElementById('search-nav-bar');
    const searchCountLabel = document.getElementById('search-count-label');
    const btnSearchPrev = document.getElementById('btn-search-prev');
    const btnSearchNext = document.getElementById('btn-search-next');

    const loginModal = document.getElementById('login-modal');
    const loginForm = document.getElementById('login-form');
    const loginPasswordInput = document.getElementById('login-password');
    const loginErrorMsg = document.getElementById('login-error');
    const btnCloseModal = document.getElementById('btn-close-modal');

    const confirmReplyModal = document.getElementById('confirm-reply-modal');
    const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    const btnConfirmAccept = document.getElementById('btn-confirm-accept');

    const overlayVideo = document.getElementById('overlay-video');
   const menuOptSettings = document.getElementById('menu-opt-settings');

   const settingsModal = document.getElementById('settings-modal');
   const btnCloseSettings = document.getElementById('btn-close-settings');
   const settingsNickname = document.getElementById('settings-nickname');
   const btnSaveNickname = document.getElementById('btn-save-nickname');
   const inputProfileImg = document.getElementById('input-profile-img');
   const inputChatBg = document.getElementById('input-chat-bg');
   const inputHomeBg = document.getElementById('input-home-bg');
   const overlayRadios = document.querySelectorAll('input[name="overlay-mode"]');

const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const btnDeleteCancel = document.getElementById('btn-delete-cancel');
const btnDeleteAccept = document.getElementById('btn-delete-accept');

    function initApp() {
        // sessionStorage로 상태 관리 세션 독립화
        sessionStorage.removeItem('artist_chat_messages');
        sessionStorage.removeItem('artist_chat_cleared_v2');

        const persistedArtistMode = sessionStorage.getItem('artistMode');
        if (persistedArtistMode === 'true') {
            currentMode = 'artist';
        } else {
            currentMode = 'fan';
        }
        applyModeState();
        loadMessages();
        listenSettings();
        setInterval(pollMessages, 3000);
    }

    function applyModeState() {
        if (currentMode === 'artist') {
            document.body.classList.add('mode-artist');
            document.body.classList.remove('mode-fan');
            menuOptAuth.textContent = '로그아웃';
        } else {
            document.body.classList.add('mode-fan');
            document.body.classList.remove('mode-artist');
            menuOptAuth.textContent = '🔐';
            cancelReplySelection();
        }
    }

    function parseMessages(data) {
    if (!data) return [];
    return Object.entries(data)
        .filter(([, v]) => v)
        .map(([key, v]) => ({ ...v, _key: key }));
}

async function loadMessages() {
    try {
        const response = await fetch(DB_API_URL);
        messages = parseMessages(await response.json());
        if (messages.length === 0) messages = [...initialMessages];
    } catch (error) {
        console.error("메시지 로드 실패:", error);
        messages = [...initialMessages];
    } finally {
        renderMessages();
    }
}

// 다른 사용자의 새 메시지 / 삭제를 3초 안에 반영
async function pollMessages() {
    try {
        const response = await fetch(DB_API_URL);
        const next = parseMessages(await response.json());
        const sig = list => list.map(m => m._key || m.id).join(',');
        if (sig(next) === sig(messages)) return;

        const c = chatMessagesContainer;
        const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 80;
        const prevTop = c.scrollTop;
        messages = next;
        renderMessages();
        if (!nearBottom) setTimeout(() => { c.scrollTop = prevTop; }, 60);
    } catch (error) { /* 일시적 네트워크 오류는 무시 */ }
}

async function saveMessages(newMsg) {
    try {
        const res = await fetch(DB_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMsg)
        });
        const result = await res.json();   // { name: "-Nabc..." }
        newMsg._key = result.name;         // 방금 보낸 메시지도 바로 삭제 가능하게
    } catch (error) {
        console.error("메시지 저장 실패:", error);
    }
}

    function openLoginModal() {
        closeMenu();
        loginPasswordInput.value = '';
        loginErrorMsg.classList.add('hidden');
        loginModal.classList.remove('hidden');
        setTimeout(() => loginPasswordInput.focus(), 50);
    }

    function closeLoginModal() {
        loginModal.classList.add('hidden');
        loginPasswordInput.value = '';
        loginErrorMsg.classList.add('hidden');
    }

    function handleLoginSubmit() {
        const val = loginPasswordInput.value;
        if (val === '1122') {
            currentMode = 'artist';
            sessionStorage.setItem('artistMode', 'true');
            applyModeState();
            closeLoginModal();
            renderMessages();
        } else {
            loginErrorMsg.classList.remove('hidden');
        }
    }

    function handleLogout() {
        closeMenu();
        closeSettingsModal();
        currentMode = 'fan';
        sessionStorage.setItem('artistMode', 'false');
        applyModeState();
        renderMessages();
    }

    function openReplyConfirmation(msgId) {
        pendingReplyTargetId = msgId;
        confirmReplyModal.classList.remove('hidden');
    }

    function closeReplyConfirmation() {
        pendingReplyTargetId = null;
        confirmReplyModal.classList.add('hidden');
    }

    function confirmReply() {
        if (pendingReplyTargetId !== null) {
            const msg = messages.find(m => m.id === pendingReplyTargetId);
            if (msg) {
                selectReplyTarget(msg);
            }
        }
        closeReplyConfirmation();
    }

    function updateSearchUI() {
        if (isSearchMode) {
            document.body.classList.add('search-mode');
            searchInput.focus();
        } else {
            document.body.classList.remove('search-mode');
            searchInput.value = '';
            clearSearchHighlights();
            searchNavBar.classList.add('hidden');
            const noResMsg = chatMessagesContainer.querySelector('.no-search-results');
            if (noResMsg) noResMsg.remove();
        }
    }

    function enterSearchMode() {
        isSearchMode = true;
        updateSearchUI();
    }

    function exitSearchMode() {
        isSearchMode = false;
        updateSearchUI();
    }

    function showHomeScreen() {
        screenChat.classList.remove('active');
        screenHome.classList.add('active');
        exitSearchMode();
    }

    function showChatScreen() {
        screenHome.classList.remove('active');
        screenChat.classList.add('active');
        exitSearchMode();
        scrollToBottom();
    }

    function renderMessages() {
        chatMessagesContainer.innerHTML = '';
        messages.forEach(msg => {
            const msgElement = createMessageDOM(msg);
            chatMessagesContainer.appendChild(msgElement);
        });
        if (isSearchMode && searchInput.value.trim()) {
            executeSearch(searchInput.value);
        }
        scrollToBottom();
    }

    function createMessageDOM(msg) {
        const groupEl = document.createElement('div');
        groupEl.classList.add('message-group');
        groupEl.dataset.id = msg.id;

        const isArtistMsg = (msg.sender === 'artist');
        const isFanMsg = (msg.sender === 'fan');

        const renderOnLeft = (currentMode === 'fan') ? isArtistMsg : !isArtistMsg;
        groupEl.classList.add(renderOnLeft ? 'left-align' : 'right-align');

        if (renderOnLeft) {
            if (currentMode === 'fan' && isArtistMsg) {
                const avatarCol = document.createElement('div');
                avatarCol.classList.add('avatar-col');
                const img = document.createElement('img');
                img.src = settings.profileImg || 'profile.png';
                img.alt = 'Avatar';
                img.classList.add('message-avatar');
                avatarCol.appendChild(img);
                groupEl.appendChild(avatarCol);

                const contentCol = document.createElement('div');
                contentCol.classList.add('content-col');

                const nameEl = document.createElement('div');
                nameEl.classList.add('sender-name');
                nameEl.textContent = settings.nickname || '새미로';
                contentCol.appendChild(nameEl);

                appendBubbleOrReply(contentCol, msg, isFanMsg);
                groupEl.appendChild(contentCol);
            } else {
                const contentCol = document.createElement('div');
                contentCol.classList.add('content-col');
                appendBubbleOrReply(contentCol, msg, isFanMsg);
                groupEl.appendChild(contentCol);
            }
        } else {
            const contentCol = document.createElement('div');
            contentCol.classList.add('content-col');
            appendBubbleOrReply(contentCol, msg, isFanMsg);
            groupEl.appendChild(contentCol);
        }

        attachLongPressDelete(groupEl, msg);
        return groupEl;
    }

    function appendBubbleOrReply(parentContainer, msg, isFanMsg) {
        if (msg.type === 'reply' || msg.replyTo) {
            const replyGroup = document.createElement('div');
            replyGroup.classList.add('reply-group-container');

            const targetMsg = messages.find(m => m.id === msg.replyTo);
            const targetText = targetMsg ? targetMsg.text : (typeof msg.replyTo === 'object' ? msg.replyTo.text : '삭제된 메시지입니다');

            const quotedCard = document.createElement('div');
            quotedCard.classList.add('quoted-card');
            
            const cardHeader = document.createElement('div');
            cardHeader.classList.add('quoted-card-header');
            cardHeader.innerHTML = '<strong class="highlight-artist">새미로</strong>의 답장';

            const cardBody = document.createElement('div');
            cardBody.classList.add('quoted-card-body');
            cardBody.textContent = targetText;

            quotedCard.appendChild(cardHeader);
            quotedCard.appendChild(cardBody);

            const replyBubble = document.createElement('div');
            replyBubble.classList.add('bubble', 'bubble-white', 'reply-actual-bubble');
            replyBubble.textContent = msg.text;

            replyGroup.appendChild(quotedCard);
            replyGroup.appendChild(replyBubble);
            parentContainer.appendChild(replyGroup);

        } else if (msg.type === 'image') {
            const imgEl = document.createElement('img');
            imgEl.src = msg.text;
            imgEl.classList.add('chat-image');
            parentContainer.appendChild(imgEl);
        } else {
            const bubble = document.createElement('div');
            bubble.classList.add('bubble', 'bubble-white');
            bubble.textContent = msg.text;

            if (currentMode === 'artist' && isFanMsg) {
                bubble.classList.add('selectable-target');
                if (selectedReplyMessageId === msg.id) {
                    bubble.classList.add('bubble-selected-target');
                }
                bubble.addEventListener('click', () => handleFanMessageClick(msg.id));
            }

            parentContainer.appendChild(bubble);
        }
    }

    function handleFanMessageClick(msgId) {
      if (Date.now() < suppressClickUntil) return;
      if (currentMode !== 'artist') return;
      openReplyConfirmation(msgId);
    }

    function scrollToBottom() {
        setTimeout(() => {
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }, 50);
    }

    function autoResizeTextarea() {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
    }

    function selectReplyTarget(msg) {
        if (currentMode !== 'artist' || msg.sender !== 'fan') return;

        selectedReplyMessageId = msg.id;
        replyPreviewText.textContent = msg.text;
        replyPreviewBar.classList.remove('hidden');

        document.querySelectorAll('.bubble-selected-target').forEach(el => {
            el.classList.remove('bubble-selected-target');
        });

        const targetNode = chatMessagesContainer.querySelector(`[data-id="${msg.id}"] .bubble`);
        if (targetNode) {
            targetNode.classList.add('bubble-selected-target');
        }

        chatInput.focus();
    }

    function cancelReplySelection() {
        selectedReplyMessageId = null;
        replyPreviewBar.classList.add('hidden');
        document.querySelectorAll('.bubble-selected-target').forEach(el => {
            el.classList.remove('bubble-selected-target');
        });
    }

    async function sendImageMessage(imageData) {
        if (currentMode !== 'artist') return;

        const newMsg = {
            id: Date.now(),
            sender: 'artist',
            type: 'image',
            text: imageData
        };

        messages.push(newMsg);
        const msgDOM = createMessageDOM(newMsg);
        chatMessagesContainer.appendChild(msgDOM);
        scrollToBottom();

        await saveMessages(newMsg);
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        const senderRole = (currentMode === 'artist') ? 'artist' : 'fan';
        const isReply = (currentMode === 'artist' && selectedReplyMessageId !== null);

        const newMsg = {
            id: Date.now(),
            sender: senderRole,
            type: isReply ? 'reply' : 'normal',
            text: text
        };

        if (isReply) {
            newMsg.replyTo = selectedReplyMessageId;
        }

        messages.push(newMsg);
        const msgDOM = createMessageDOM(newMsg);
        chatMessagesContainer.appendChild(msgDOM);

        chatInput.value = '';
        autoResizeTextarea();
        cancelReplySelection();
        scrollToBottom();

        await saveMessages(newMsg);
    }

    function executeSearch(keyword) {
        clearSearchHighlights();
        const trimmed = keyword.trim().toLowerCase();
        
        const noResMsg = chatMessagesContainer.querySelector('.no-search-results');
        if (noResMsg) noResMsg.remove();

        if (!trimmed) {
            searchNavBar.classList.add('hidden');
            return;
        }

        searchMatches = [];
        messages.forEach(msg => {
            const mainMatch = msg.text && msg.text.toLowerCase().includes(trimmed);
            let replyMatch = false;
            if (msg.replyTo) {
                const targetMsg = messages.find(m => m.id === msg.replyTo);
                if (targetMsg && targetMsg.text && targetMsg.text.toLowerCase().includes(trimmed)) {
                    replyMatch = true;
                }
            }
            if (mainMatch || replyMatch) {
                searchMatches.push(msg.id);
            }
        });

        if (searchMatches.length === 0) {
            searchNavBar.classList.add('hidden');
            const noRes = document.createElement('div');
            noRes.classList.add('no-search-results');
            noRes.textContent = '검색 결과가 없습니다';
            chatMessagesContainer.appendChild(noRes);
        } else {
            currentSearchIndex = 0;
            updateSearchHighlightPosition();
        }
    }

    function updateSearchHighlightPosition() {
        clearSearchHighlights();
        if (searchMatches.length === 0) return;

        const targetId = searchMatches[currentSearchIndex];
        const targetNode = chatMessagesContainer.querySelector(`[data-id="${targetId}"]`);

        if (targetNode) {
            const bubbles = targetNode.querySelectorAll('.bubble, .quoted-card');
            bubbles.forEach(b => b.classList.add('search-highlight'));
            targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        if (searchMatches.length >= 2) {
            searchCountLabel.textContent = `${currentSearchIndex + 1} / ${searchMatches.length}`;
            searchNavBar.classList.remove('hidden');
        } else {
            searchNavBar.classList.add('hidden');
        }
    }

    function clearSearchHighlights() {
        const highlighted = chatMessagesContainer.querySelectorAll('.search-highlight');
        highlighted.forEach(el => el.classList.remove('search-highlight'));
    }

    function goToNextSearchResult() {
        if (searchMatches.length < 2) return;
        currentSearchIndex = (currentSearchIndex + 1) % searchMatches.length;
        updateSearchHighlightPosition();
    }

    function goToPreviousSearchResult() {
        if (searchMatches.length < 2) return;
        currentSearchIndex = (currentSearchIndex - 1 + searchMatches.length) % searchMatches.length;
        updateSearchHighlightPosition();
    }

    function toggleMenu() {
        chatMenuDropdown.classList.toggle('hidden');
    }

    function closeMenu() {
        chatMenuDropdown.classList.add('hidden');
    }

// ===== 설정 (닉네임 / 이미지 / 오버레이) =====
function applySettings(prev = {}) {
    const nick = settings.nickname || DEFAULT_SETTINGS.nickname;
    document.querySelectorAll('.js-nickname').forEach(el => { el.textContent = nick; });

    const avatar = settings.profileImg || 'profile.png';
    document.querySelectorAll('.js-profile-img').forEach(img => {
        if (img.getAttribute('src') !== avatar) img.src = avatar;
    });

    screenHome.style.backgroundImage = settings.homeBg ? `url("${settings.homeBg}")` : '';
    screenChat.style.backgroundImage = settings.chatBg ? `url("${settings.chatBg}")` : '';

    applyOverlay(settings.overlay);

    if (document.activeElement !== settingsNickname) settingsNickname.value = settings.nickname || '';
    overlayRadios.forEach(r => { r.checked = (r.value === (settings.overlay || 'none')); });

    // 채팅 말풍선 옆 이름/아바타는 다시 그려야 반영됨
    if (prev.nickname !== settings.nickname || prev.profileImg !== settings.profileImg) {
        renderMessages();
    }
}

function applyOverlay(mode) {
    const src = OVERLAY_SRC[mode];
    if (!src) {
        overlayVideo.pause();
        overlayVideo.classList.add('hidden');
        overlayVideo.removeAttribute('src');
        overlayVideo.load();
        return;
    }
    if (!overlayVideo.src.endsWith(src)) overlayVideo.src = src;
    overlayVideo.classList.remove('hidden');
    overlayVideo.play().catch(() => {});
}

// 서버 설정 실시간 수신 (Firebase 스트리밍) — 누가 바꿔도 즉시 반영
function listenSettings() {
    const es = new EventSource(SETTINGS_URL);
    const handler = (e) => {
        const { path, data } = JSON.parse(e.data);
        const prev = { ...settings };
        if (path === '/') {
            if (data) Object.assign(settings, data);
        } else {
            settings[path.slice(1)] = data;
        }
        applySettings(prev);
    };
    es.addEventListener('put', handler);
    es.addEventListener('patch', handler);
}

async function saveSettings(partial) {
    if (currentMode !== 'artist') return;
    const prev = { ...settings };
    Object.assign(settings, partial);      // 내 화면에 즉시 반영
    applySettings(prev);
    try {
        await fetch(SETTINGS_URL, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(partial)
        });
    } catch (error) {
        console.error("설정 저장 실패:", error);
    }
}

// 서버 용량을 위해 리사이즈 후 base64로 변환
function fileToDataURL(file, maxSize, type) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL(type, 0.82));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function bindImageSetting(input, key, maxSize, type) {
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await saveSettings({ [key]: await fileToDataURL(file, maxSize, type) });
        } catch (err) {
            console.error("이미지 처리 실패:", err);
        }
        input.value = '';
    });
}

function openSettingsModal() {
    if (currentMode !== 'artist') return;
    closeMenu();
    settingsNickname.value = settings.nickname || '';
    settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
    settingsModal.classList.add('hidden');
}

// ===== 메시지 삭제 =====
function attachLongPressDelete(el, msg) {
    let timer = null;
    let fired = false;
    const cancel = () => { clearTimeout(timer); timer = null; };

    el.addEventListener('touchstart', () => {
        if (currentMode !== 'artist') return;
        fired = false;
        timer = setTimeout(() => { fired = true; openDeleteConfirmation(msg); }, 600);
    }, { passive: true });
    el.addEventListener('touchmove', cancel, { passive: true });
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('touchend', () => {
        cancel();
        if (fired) suppressClickUntil = Date.now() + 400;   // 손 뗄 때 생기는 클릭 무시
    });
    // PC: 우클릭
    el.addEventListener('contextmenu', (e) => {
        if (currentMode !== 'artist') return;
        e.preventDefault();
        openDeleteConfirmation(msg);
    });
}

function openDeleteConfirmation(msg) {
    if (currentMode !== 'artist') return;
    pendingDeleteMsg = msg;
    deleteConfirmModal.classList.remove('hidden');
}

function closeDeleteConfirmation() {
    pendingDeleteMsg = null;
    deleteConfirmModal.classList.add('hidden');
}

async function confirmDelete() {
    const msg = pendingDeleteMsg;
    closeDeleteConfirmation();
    if (!msg || currentMode !== 'artist') return;

    if (selectedReplyMessageId === msg.id) cancelReplySelection();
    messages = messages.filter(m => m !== msg);
    renderMessages();

    if (msg._key) {
        try {
            await fetch(`${DB_BASE}/messages/${msg._key}.json`, { method: 'DELETE' });
        } catch (error) {
            console.error("메시지 삭제 실패:", error);
        }
    }
}

    // Event Listeners
    if (btnAttachImage && imageInput) {
        btnAttachImage.addEventListener('click', () => {
            if (currentMode !== 'artist') return;
            imageInput.click();
        });

        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(event) {
                sendImageMessage(event.target.result);
            };
            reader.readAsDataURL(file);
            imageInput.value = '';
        });
    }

    btnEnterChat.addEventListener('click', showChatScreen);
    btnBackHome.addEventListener('click', showHomeScreen);

    btnOpenSearch.addEventListener('click', enterSearchMode);
    btnCloseSearch.addEventListener('click', exitSearchMode);
    btnCancelSearch.addEventListener('click', exitSearchMode);

    searchInput.addEventListener('input', (e) => {
        executeSearch(e.target.value);
    });

    btnSearchNext.addEventListener('click', goToNextSearchResult);
    btnSearchPrev.addEventListener('click', goToPreviousSearchResult);

    btnOpenMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });

    document.addEventListener('click', (e) => {
        if (!chatMenuDropdown.contains(e.target) && e.target !== btnOpenMenu) {
            closeMenu();
        }
    });

    menuOptAuth.addEventListener('click', () => {
        if (currentMode === 'artist') {
            handleLogout();
        } else {
            openLoginModal();
        }
    });

    btnCloseModal.addEventListener('click', closeLoginModal);
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLoginSubmit();
    });

    btnConfirmCancel.addEventListener('click', closeReplyConfirmation);
    btnConfirmAccept.addEventListener('click', confirmReply);

    chatInput.addEventListener('input', autoResizeTextarea);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
        }
    });

    btnSend.addEventListener('click', sendMessage);
    btnCancelReply.addEventListener('click', cancelReplySelection);

        // 설정
    menuOptSettings.addEventListener('click', openSettingsModal);
    btnCloseSettings.addEventListener('click', closeSettingsModal);
    btnSaveNickname.addEventListener('click', () => {
        const v = settingsNickname.value.trim();
        if (v) saveSettings({ nickname: v });
    });
    bindImageSetting(inputProfileImg, 'profileImg', 400, 'image/png');
    bindImageSetting(inputChatBg, 'chatBg', 1200, 'image/jpeg');
    bindImageSetting(inputHomeBg, 'homeBg', 1200, 'image/jpeg');
    document.querySelectorAll('[data-reset]').forEach(btn => {
        btn.addEventListener('click', () => saveSettings({ [btn.dataset.reset]: '' }));
    });
    overlayRadios.forEach(r => {
        r.addEventListener('change', () => { if (r.checked) saveSettings({ overlay: r.value }); });
    });

    // 삭제
    btnDeleteCancel.addEventListener('click', closeDeleteConfirmation);
    btnDeleteAccept.addEventListener('click', () => {
        if (Date.now() < suppressClickUntil) return;
        confirmDelete();
    });
    initApp();
});
