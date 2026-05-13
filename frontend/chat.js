const socket = io("http://localhost:5000");
const myId   = localStorage.getItem("userId");
const unreadCounts = {};
if (!myId) window.location.href = "login.html";

socket.emit("userOnline", myId);

let activeReceiverId   = null;
let activeReceiverName = null;
let allUsers           = [];

// ── UPDATE NAV BADGE (homepage sidebar "Messages" link pe count) ──
function updateNavMessageBadge(count) {
    // Chat page mein ek total-unread badge dikhao agar element hai
    let navBadge = document.getElementById("navMsgBadge");
    if (!navBadge) {
        // Agar badge element nahi hai toh create karo
        const msgLink = document.querySelector('a[href="chat.html"]');
        if (msgLink) {
            navBadge = document.createElement("span");
            navBadge.id = "navMsgBadge";
            navBadge.style.cssText = `
                background: linear-gradient(135deg, #6938be, #d61ec1);
                color: white; font-size: 11px; font-weight: 700;
                min-width: 20px; height: 20px; border-radius: 50%;
                display: inline-flex; align-items: center;
                justify-content: center; margin-left: 8px;
                box-shadow: 0 2px 8px rgba(105,56,190,0.4);
                animation: badgePop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            `;
            msgLink.appendChild(navBadge);
        }
    }
    if (navBadge) {
        const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
        navBadge.textContent  = total;
        navBadge.style.display = total > 0 ? "inline-flex" : "none";
    }
}

// ── FETCH ALL USERS ──
async function fetchUsers() {
    const res  = await fetch(`http://localhost:5000/chat-users/${myId}`);
    allUsers   = await res.json();
    displayUsers(allUsers);
}

function displayUsers(users) {
    const container = document.getElementById("usersList");
    container.innerHTML = "";

    if (users.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:30px; color:#9b7cb8; font-size:13px;">No users found 🌸</div>`;
        return;
    }

    users.forEach(user => {
        const div = document.createElement("div");
        div.classList.add("user-item");
        div.setAttribute("data-id", user._id);

        const count = unreadCounts[user._id] || 0;

        div.innerHTML = `
            <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
            <div class="user-info-text">
                <div class="user-name">${user.username}</div>
                <div class="last-message" id="last-${user._id}" style="font-weight:${count > 0 ? '700' : '400'}; color:${count > 0 ? '#6938be' : '#9b7cb8'};">
                    ${user.lastMessageText
                        ? user.lastMessageText.slice(0, 28) + (user.lastMessageText.length > 28 ? "..." : "")
                        : "Tap to chat 💬"}
                </div>
            </div>
            <div class="msg-time" id="time-${user._id}">
                ${user.lastMessageTime
                    ? new Date(user.lastMessageTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : ""}
            </div>
            ${count > 0 ? `<div class="unread-badge">${count}</div>` : ""}
        `;

        div.onclick = () => openChat(user);
        container.appendChild(div);
    });
}

// ── OPEN CHAT ──
async function openChat(user) {
    // ✅ Unread count reset
    unreadCounts[user._id] = 0;
    updateNavMessageBadge();

    const userEl = document.querySelector(`[data-id="${user._id}"]`);
    if (userEl) {
        const badge   = userEl.querySelector(".unread-badge");
        if (badge) badge.remove();
        const lastMsg = userEl.querySelector(".last-message");
        if (lastMsg) { lastMsg.style.fontWeight = "400"; lastMsg.style.color = "#9b7cb8"; }
    }

    activeReceiverId   = user._id;
    activeReceiverName = user.username;

    // Active class update
    document.querySelectorAll(".user-item").forEach(el => el.classList.remove("active"));
    const activeEl = document.querySelector(`[data-id="${user._id}"]`);
    if (activeEl) activeEl.classList.add("active");

    // Build right panel
    const rightPanel = document.getElementById("rightPanel");
    rightPanel.innerHTML = `
        <div class="chat-header">
            <div class="user-avatar">
                ${user.username.charAt(0).toUpperCase()}
                <div class="online-dot"></div>
            </div>
            <div class="chat-header-info">
                <div class="user-name">${user.username}</div>
                <div class="user-status">Active now ✨</div>
            </div>
            <div class="chat-header-actions">
                <button class="action-btn" title="Call">📞</button>
                <button class="action-btn" title="Video">🎥</button>
                <button class="action-btn" title="Info">ℹ️</button>
            </div>
        </div>
        <div class="messages-area" id="messagesArea"></div>
        <div class="input-area">
            <div class="input-wrap">
                <button class="emoji-btn">😊</button>
                <input type="text" id="messageInput" placeholder="Type a message...">
            </div>
            <button class="send-btn" onclick="sendMessage()">➤</button>
        </div>
    `;

    document.getElementById("messageInput").addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });

    await loadMessages();
}

// ── LOAD MESSAGES ──
async function loadMessages() {
    const res      = await fetch(`http://localhost:5000/messages/${myId}/${activeReceiverId}`);
    const messages = await res.json();
    const area     = document.getElementById("messagesArea");
    area.innerHTML = "";

    if (messages.length === 0) {
        area.innerHTML = `
            <div style="text-align:center; margin-top:40px; color:#9b7cb8;">
                <div style="font-size:40px; margin-bottom:10px;">🌸</div>
                <div style="font-size:13px;">Say hello to ${activeReceiverName}!</div>
            </div>`;
        return;
    }

    let lastDate = null;
    messages.forEach(msg => {
        const msgDate = new Date(msg.createdAt).toDateString();
        if (msgDate !== lastDate) {
            lastDate = msgDate;
            const divider = document.createElement("div");
            divider.classList.add("date-divider");
            divider.innerHTML = `<span>${formatDate(msg.createdAt)}</span>`;
            area.appendChild(divider);
        }
        appendMessage(msg.message, msg.senderId === myId ? "sent" : "received", msg.createdAt);
    });

    area.scrollTop = area.scrollHeight;
}

// ── APPEND MESSAGE ──
function appendMessage(text, type, time) {
    const area = document.getElementById("messagesArea");
    if (!area) return;

    const emptyState = area.querySelector("div[style]");
    if (emptyState) emptyState.remove();

    const div = document.createElement("div");
    div.classList.add("message", type);

    const t = time ? new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

    div.innerHTML = `
        <div class="message-bubble">${escapeHtml(text)}</div>
        <div class="message-time">
            ${t}
            ${type === "sent" ? '<span class="seen-tick"></span>' : ''}
        </div>
    `;

    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// ── SEND MESSAGE ──
async function sendMessage() {
    const input = document.getElementById("messageInput");
    const text  = input.value.trim();
    if (!text || !activeReceiverId) return;

    input.value = "";

    const token = localStorage.getItem("token"); // ✅ token lo
    await fetch("http://localhost:5000/message", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`  // ✅ token bhejo
        },
        body: JSON.stringify({ senderId: myId, receiverId: activeReceiverId, message: text })
    });

    socket.emit("sendMessage", { senderId: myId, receiverId: activeReceiverId, message: text });

    appendMessage(text, "sent", new Date());
    updateLastMessage(activeReceiverId, text);
}

// ── RECEIVE MESSAGE ──
socket.on("receiveMessage", (data) => {
    if (data.senderId === activeReceiverId) {
        // ✅ Agar chat khula hua hai toh message dikhao
        appendMessage(data.message, "received", new Date());
    } else {
        // ✅ Unread count badhao
        unreadCounts[data.senderId] = (unreadCounts[data.senderId] || 0) + 1;
        updateBadge(data.senderId);
        updateNavMessageBadge();
    }

    updateLastMessage(data.senderId, data.message);
    moveUserToTop(data.senderId);           // ✅ User top pe aajaye
});

// ── UPDATE LAST MESSAGE ──
function updateLastMessage(userId, text) {
    const lastEl = document.getElementById(`last-${userId}`);
    const timeEl = document.getElementById(`time-${userId}`);
    if (lastEl) lastEl.textContent = text.length > 28 ? text.slice(0, 28) + "..." : text;
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ✅ FIXED: User ko top pe le aao
function moveUserToTop(userId) {
    const userEl    = document.querySelector(`[data-id="${userId}"]`);
    const container = document.getElementById("usersList");
    if (userEl && container) container.prepend(userEl);
}

// ✅ FIXED: Badge + bold last message
function updateBadge(userId) {
    const userEl = document.querySelector(`[data-id="${userId}"]`);
    if (!userEl) return;

    let badge = userEl.querySelector(".unread-badge");
    if (!badge) {
        badge = document.createElement("div");
        badge.classList.add("unread-badge");
        userEl.appendChild(badge);
    }
    badge.textContent = unreadCounts[userId];

    // ✅ Last message bold + purple
    const lastMsg = userEl.querySelector(".last-message");
    if (lastMsg) {
        lastMsg.style.fontWeight = "700";
        lastMsg.style.color      = "#6938be";
    }
}

// ── SEARCH ──
document.getElementById("searchUser").addEventListener("input", function () {
    const value    = this.value.toLowerCase();
    const filtered = allUsers.filter(u => u.username.toLowerCase().includes(value));
    displayUsers(filtered);
});

// ── HELPERS ──
function formatDate(dateStr) {
    const date      = new Date(dateStr);
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString())     return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ── INIT ──
fetchUsers();

// ── URL se directly kisi ka chat kholo (friends.html se redirect) ──
window.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);
    const openUserId = params.get("openUser");
    if (openUserId) {
        // Wait for users to load then open that chat
        const interval = setInterval(() => {
            const user = allUsers.find(u => u._id === openUserId);
            if (user) {
                clearInterval(interval);
                openChat(user);
            }
        }, 300);
    }
});