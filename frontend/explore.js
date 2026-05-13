// explore.js — Fixed version
// Fixes: search bug, missing unfriend() and blockUser() functions

let myFriends     = [];
let allMyRequests = [];
let allUsersCache = []; // ✅ cache for search

// 1. Auth Check
if (!localStorage.getItem("userId")) {
    window.location.href = "login.html";
}

// 2. Fetch Friends
async function fetchFriends() {
    try {
        const userId = localStorage.getItem("userId");
        const res    = await fetch(`http://localhost:5000/friends/${userId}`);
        myFriends    = await res.json();
    } catch (err) {
        console.error("Doston ki list nahi mil rahi:", err);
        myFriends = [];
    }
}

// 3. Fetch Requests
async function fetchAllRequests() {
    try {
        const userId      = localStorage.getItem("userId");
        const res         = await fetch(`http://localhost:5000/all-requests/${userId}`);
        allMyRequests     = await res.json();
    } catch (err) {
        console.error("Requests fetch karne mein dikkat hui:", err);
        allMyRequests = [];
    }
}

// 4. Fetch and Display Users
async function fetchUsers() {
    try {
        const userId = localStorage.getItem("userId");
        const res    = await fetch(`http://localhost:5000/users/${userId}`);
        const users  = await res.json();

        if (Array.isArray(users)) {
            allUsersCache = users; // ✅ save for search
            displayUsers(users);
        } else {
            console.error("Users ka data array nahi hai");
        }
    } catch (err) {
        console.error("Users load nahi ho paye:", err);
    }
}

// 5. Button Logic
function getButtonHTML(user, currentUserId) {
    if (!user || !user._id) return "";

    if (user._id === currentUserId) {
        return `<button class="btn-profile">Apni Profile 😎</button>`;
    }

    // Friend Check
    const isFriend = myFriends.some(f => f._id?.toString() === user._id.toString());
    if (isFriend) {
        return `
            <div class="friend-actions">
                <button onclick="toggleMenu(this)" class="btn-friend">Pakka Dost! 🤜🤛</button>
                <div class="menu" style="display: none;">
                    <button onclick="unfriend('${user._id}')">Katti (Unfriend)</button>
                    <button onclick="blockUser('${user._id}')">Block Karein 🚫</button>
                </div>
            </div>`;
    }

    // Request Check
    const rel = allMyRequests.find(req =>
        (req.sender?._id?.toString() === user._id.toString() || req.sender?.toString() === user._id.toString()) ||
        (req.receiver?._id?.toString() === user._id.toString() || req.receiver?.toString() === user._id.toString())
    );

    if (rel) {
        const senderId   = rel.sender?._id   || rel.sender;
        const receiverId = rel.receiver?._id || rel.receiver;

        if (rel.status === "pending" && senderId.toString() === currentUserId) {
            return `<button disabled class="btn-pending">Wait Karo... ⏳</button>`;
        }
        if (rel.status === "pending" && receiverId.toString() === currentUserId) {
            return `<button onclick="window.location.href='requests.html'" class="btn-respond">Reply Do? 🤔</button>`;
        }
    }

    return `<button onclick="sendRequest('${user._id}', this)" class="btn-add">Dosti Karoge? 🤝</button>`;
}

// 6. UI Rendering
function displayUsers(users) {
    const container    = document.getElementById("usersList");
    container.innerHTML = "";
    const currentUserId = localStorage.getItem("userId");

    if (users.length === 0) {
        container.innerHTML = `<p style="text-align:center; width:100%; color:gray;">Yahan toh sannata hai... Koi nahi mila! 🕵️‍♂️</p>`;
        return;
    }

    users.forEach(user => {
        const div = document.createElement("div");
        div.classList.add("user-card");

        const buttonHTML = getButtonHTML(user, currentUserId);

        div.innerHTML = `
            <div class="user-info" onclick="window.location.href='friend-profile.html?id=${user._id}'" style="cursor:pointer;">
                <div class="user-avatar">
                    ${user.username.charAt(0).toUpperCase()}
                </div>
                <span class="user-name-text">${user.username}</span>
            </div>
            ${buttonHTML}
        `;

        container.appendChild(div);
    });
}

// 7. Send Request
async function sendRequest(receiverId, btn) {
    try {
        const token = localStorage.getItem("token");
        const res   = await fetch("http://localhost:5000/send-request", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ receiverId })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        btn.innerText = "Wait Karo... ⏳";
        btn.disabled  = true;
        btn.style.background = "#ccc";
    } catch (err) {
        alert("Ouch! Request nahi gayi: " + err.message);
    }
}

function toggleMenu(btn) {
    const menu     = btn.nextElementSibling;
    const isVisible = menu.style.display === "block";
    document.querySelectorAll('.menu').forEach(m => m.style.display = 'none');
    menu.style.display = isVisible ? "none" : "block";
}

// ✅ FIX: unfriend function add kiya (missing tha)
async function unfriend(friendId) {
    if (!confirm("Pakka unfriend karna hai? 💔")) return;
    try {
        const token = localStorage.getItem("token");
        const res   = await fetch("http://localhost:5000/unfriend", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ friendId })
        });
        const data = await res.json();
        alert(data.message);
        // Refresh page data
        await fetchFriends();
        await fetchAllRequests();
        displayUsers(allUsersCache);
    } catch (err) {
        alert("Unfriend nahi ho paya: " + err.message);
    }
}

// ✅ FIX: blockUser function add kiya (missing tha)
async function blockUser(blockId) {
    if (!confirm("Is user ko block karna hai? 🚫")) return;
    try {
        const myId = localStorage.getItem("userId");
        const res  = await fetch("http://localhost:5000/block-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ myId, blockId })
        });
        const data = await res.json();
        alert(data.message);
        // Remove blocked user from list
        allUsersCache = allUsersCache.filter(u => u._id !== blockId);
        displayUsers(allUsersCache);
    } catch (err) {
        alert("Block nahi ho paya: " + err.message);
    }
}

// 8. Initialization and Search
window.onload = async () => {
    await fetchFriends();
    await fetchAllRequests();
    await fetchUsers();

    // ✅ FIX: Search query selector corrected (.user-name-text class use kiya)
    const searchInput = document.getElementById("searchUser");
    if (searchInput) {
        searchInput.addEventListener("input", function () {
            const query   = this.value.toLowerCase().trim();
            const filtered = allUsersCache.filter(u =>
                u.username.toLowerCase().includes(query)
            );
            displayUsers(filtered);
        });
    }
};