// 🛠️ Helper: Time formatter
function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(date).toLocaleDateString();
}
 
// 🛠️ Helper: Icons
function getNotifIcon(type) {
    const icons = {
        like: "❤️",
        comment: "💬",
        follow: "👤",
        accept: "🤝",
        message: "💌",
        system: "🔔"
    };
    return icons[type] || "🔔";
}
 
// 📥 Load Notifications
async function loadNotifications() {
    const userId = localStorage.getItem("userId");
    if (!userId) return;
 
    const list  = document.getElementById("notifList");
    const badge = document.getElementById("notifCount");
    if (!list || !badge) return;
 
    try {
        const token = localStorage.getItem("token");
        const res   = await fetch(`http://localhost:5000/notifications/${userId}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
 
        if (!Array.isArray(data) || data.length === 0) {
            list.innerHTML = `<div style="padding:20px;text-align:center;color:#999;">No notifications 🔕</div>`;
            badge.style.display = "none";
            return;
        }
 
        let unread = 0;
        list.innerHTML = data.map(n => {
            if (!n.read) unread++;
            return `
            <div class="notification-item ${n.read ? '' : 'notif-unread'}">
                <span>${getNotifIcon(n.type)}</span>
                <div>
                    <strong>${n.senderName || 'Someone'}</strong> ${n.message || ''}
                    <div style="font-size:11px;color:#999">${timeAgo(n.createdAt)}</div>
                </div>
            </div>`;
        }).join("");
 
        badge.style.display = unread > 0 ? "flex" : "none";
        badge.textContent   = unread > 9 ? "9+" : unread;
 
    } catch (err) {
        const list = document.getElementById("notifList");
        if (list) list.innerHTML = `<div style="padding:14px;text-align:center;">Error 😕</div>`;
    }
}
 
// ✅ Mark all as read
async function markAllAsRead() {
    const userId = localStorage.getItem("userId");
    if (!userId) return;
    try {
        await fetch("http://localhost:5000/notifications/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId })
        });
        loadNotifications();
    } catch (e) {
        console.error("Mark read error:", e);
    }
}
 
// 🎯 Event Handling — runs after notification.html is injected into DOM
function initNotificationBell() {
    const bell     = document.getElementById("notificationBell");
    const dropdown = document.getElementById("notifDropdown");
    if (!bell || !dropdown) return;
 
    // 🔔 Bell click — toggle dropdown
    bell.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = dropdown.style.display === "block";
        dropdown.style.display = isOpen ? "none" : "block";
        if (!isOpen) {
            loadNotifications();
            setTimeout(markAllAsRead, 500);
        }
    });
 
    // ❌ Inside click — don't close dropdown
    dropdown.addEventListener("click", (e) => e.stopPropagation());
 
    // 🔄 Initial load + auto refresh every 30s
    loadNotifications();
    setInterval(loadNotifications, 30000);
}
 
// Outside click → close dropdown (added at document level)
document.addEventListener("click", () => {
    const dropdown = document.getElementById("notifDropdown");
    if (dropdown) dropdown.style.display = "none";
});