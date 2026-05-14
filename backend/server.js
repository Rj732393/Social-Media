require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

// Models
const Notification = require("./models/Notification");
const User = require("./models/User");
const FriendRequest = require("./models/FriendRequest");
const Post = require("./models/Post");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// --- 1. MIDDLEWARES & SETUP ---
app.use(express.json());
app.use(cors());
app.use("/uploads", express.static("uploads"));

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- 2. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("DB connected ek dum fit hai ✅"))
    .catch((err) => console.log("DB Connection Error:", err));

// --- 3. AUTH MIDDLEWARE ---

// Normal user ke liye
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Token nahi hai, pehle login karo ❌" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ message: "Token galat ya expire ho gaya ❌" });
    }
};

// Admin ke liye
const adminAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Token nahi hai ❌" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded.isAdmin) return res.status(403).json({ message: "Bhai tu admin nahi hai ❌" });
        req.userId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ message: "Invalid token ❌" });
    }
};

// --- 4. COMMON NOTIFICATION FUNCTION ---
async function createNotification({ sender, recipient, type, message }) {
    try {
        if (!sender || !recipient) return;
        if (sender.toString() === recipient.toString()) return; // apne aap ko noti mat bhejo

        await Notification.create({ sender, recipient, type, message }); // ✅ DB mein save
    } catch (err) {
        console.error("Notification error:", err);
    }
}

// --- 5. BASIC ROUTES ---

app.get("/", (req, res) => {
    res.send("Server + DB ek dum Mast chal raha hai 🚀");
});

app.post("/signup", async (req, res) => {
    try {
        const { username, email, phone, dob, password } = req.body;
        if (!username || !email || !phone || !dob || !password) {
            return res.status(400).json({ message: "Bhai, saari details bharna zaroori hai ❌" });
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) return res.status(400).json({ message: "Email ka format galat hai ❌" });

        const phonePattern = /^[6-9]\d{9}$/;
        if (!phonePattern.test(phone)) return res.status(400).json({ message: "Phone number sahi nahi hai ❌" });

        const existingEmail = await User.findOne({ email });
        if (existingEmail) return res.status(400).json({ message: "Ye Email pehle se hi kisi ne le rakha hai ❌" });

        const existingPhone = await User.findOne({ phone });
        if (existingPhone) return res.status(400).json({ message: "Ye Number pehle se register hai ❌" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username, email, phone, dob,
            password: hashedPassword,
            gender: "Female",
            isActive: false
        });
        await newUser.save();
        res.json({ message: "Aapka swagat hai! Account ban gaya ✅" });
    } catch (error) {
        res.status(500).json({ message: "Server mein kuch gadbad ho gayi" });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { input, password } = req.body;
        const user = await User.findOne({ $or: [{ email: input }, { phone: input }] });

        if (!user) return res.status(400).json({ message: "Ye banda (User) nahi mil raha hai ❌" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Galat password! Yaad karo kya dala tha ❌" });

        const token = jwt.sign(
            { userId: user._id, isAdmin: user.isAdmin || false },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({
            message: "Mubarak ho! Login ho gaya ✅",
            token,
            userId: user._id,
            username: user.username,
            isActive: user.isActive
        });
    } catch (error) {
        res.status(500).send(error);
    }
});

// --- 6. POSTS & FEED ROUTES ---

app.post("/posts", authMiddleware, upload.single("media"), async (req, res) => {
    try {
        const { caption } = req.body;
        const userId = req.userId; // ✅ token se lo, body se nahi
        let mediaUrl = req.file ? `${process.env.BASE_URL || "https://social-media-8im4.onrender.com"}/uploads/${req.file.filename}` : "";

        const newPost = new Post({ userId, caption, mediaUrl, likes: [], comments: [] });
        await newPost.save();
        res.status(201).json(newPost);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/posts", async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 });

        const postsWithUser = await Promise.all(posts.map(async (post) => {
            const user = await User.findById(post.userId).select("username profilePic");
            return {
                ...post.toObject(),
                username: user?.username || "User",
                userProfilePic: user?.profilePic || ""
            };
        }));

        res.json(postsWithUser);
    } catch (error) {
        res.status(500).send(error);
    }
});

// Comment API
app.post("/posts/:id/comment", authMiddleware, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).send("Post not found");

        const { text, username } = req.body;
        const userId = req.userId;

        post.comments.push({
            text: text || "",
            username: username || "User"
        });

        await createNotification({
            sender: userId,
            recipient: post.userId,
            type: "comment",
            message: "commented on your post"
        });

        await post.save();
        res.send("Comment added");
    } catch (error) {
        res.status(500).send(error);
    }
});

// Like API
app.post("/posts/:id/like", authMiddleware, async (req, res) => {
    const userId = req.userId;

    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: "Post nahi mili" });

        if (!post.likes) post.likes = [];

        // ✅ String vs ObjectId fix
        const likeIndex = post.likes.map(id => id.toString()).indexOf(userId.toString());

        if (likeIndex !== -1) {
            post.likes.splice(likeIndex, 1); // unlike
        } else {
            post.likes.push(userId); // like

            await createNotification({
                sender: userId,
                recipient: post.userId,
                type: "like",
                message: "liked your post"
            });
        }

        await post.save();
        res.json({ message: "Like updated", likesCount: post.likes.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 7. USER PROFILE ROUTES ---

app.get("/user/:id", async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password");
        if (!user) return res.status(404).json({ msg: "Banda nahi mila" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ msg: "Server error" });
    }
});

app.get("/posts/user/:userId", async (req, res) => {
    try {
        const posts = await Post.find({ userId: req.params.userId });
        res.json(posts);
    } catch (err) {
        res.status(500).send(err);
    }
});

app.post("/upload-profile/:userId", authMiddleware, upload.single("profilePic"), async (req, res) => {
    if (!req.file) return res.status(400).send("File toh daalo bhai");
    const imagePath = `${process.env.BASE_URL || "https://social-media-8im4.onrender.com"}/uploads/${req.file.filename}`;
    await User.findByIdAndUpdate(req.params.userId, { profilePic: imagePath });
    res.json({ imagePath });
});

app.post("/upload-cover/:userId", authMiddleware, upload.single("cover"), async (req, res) => {
    if (!req.file) return res.status(400).send("No file");
    const imagePath = `${process.env.BASE_URL || "https://social-media-8im4.onrender.com"}/uploads/${req.file.filename}`;
    await User.findByIdAndUpdate(req.params.userId, { coverImage: imagePath });
    res.json({ imagePath });
});

app.post("/update-profile", authMiddleware, async (req, res) => {
    try {
        const { name, phone, bio } = req.body;
        const userId = req.userId;
        const updateData = {};
        if (name) updateData.username = name;
        if (phone) updateData.phone = phone;
        updateData.bio = bio;
        await User.findByIdAndUpdate(userId, updateData);
        res.json("Profile chamak gayi! (Updated)");
    } catch (err) {
        res.status(500).json({ message: "Update fail ho gaya" });
    }
});

// --- 8. FRIENDS & REQUESTS ROUTES ---

app.get("/all-requests/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const requests = await FriendRequest.find({
            $or: [{ sender: userId }, { receiver: userId }]
        }).populate('sender receiver', 'username');
        res.status(200).json(requests);
    } catch (error) {
        res.status(500).json({ message: "Request nikalne mein gadbad hui", error: error.message });
    }
});

app.post("/send-request", authMiddleware, async (req, res) => {
    const senderId = req.userId;
    const { receiverId } = req.body;

    if (senderId.toString() === receiverId) {
        return res.status(400).json({ message: "Apne aap ko request? ❌" });
    }

    const existingRequest = await FriendRequest.findOne({
        $or: [
            { sender: senderId, receiver: receiverId },
            { sender: receiverId, receiver: senderId }
        ]
    });

    if (existingRequest) {
        return res.status(400).json({ message: "Already request sent ⚠️" });
    }

    await FriendRequest.create({ sender: senderId, receiver: receiverId, status: "pending" });

    await createNotification({
        sender: senderId,
        recipient: receiverId,
        type: "follow",
        message: "sent you a friend request"
    });

    res.json({ message: "Request sent ✅" });
});

app.get("/requests/:userId", async (req, res) => {
    const requests = await FriendRequest.find({ sender: req.params.userId, status: "pending" }).populate("receiver", "username");
    res.json(requests);
});

app.get("/requests/received/:userId", async (req, res) => {
    const requests = await FriendRequest.find({ receiver: req.params.userId, status: "pending" }).populate("sender", "username");
    res.json(requests);
});

app.post("/accept-request", authMiddleware, async (req, res) => {
    const { requestId } = req.body;
    const request = await FriendRequest.findById(requestId);
    if (!request || request.status !== "pending") return res.status(400).json({ message: "Ye request ab valid nahi hai" });

    await User.findByIdAndUpdate(request.sender, { $addToSet: { friends: request.receiver } });
    await User.findByIdAndUpdate(request.receiver, { $addToSet: { friends: request.sender } });
    await FriendRequest.findByIdAndDelete(requestId);

    await createNotification({
        sender: request.receiver,
        recipient: request.sender,
        type: "accept",
        message: "accepted your request"
    });

    res.json({ message: "Mubarak ho! Aaj se aap dono pakke dost hain 🤝" });
});

app.post("/reject-request", authMiddleware, async (req, res) => {
    const { requestId } = req.body;
    await FriendRequest.findByIdAndDelete(requestId);
    res.json({ message: "Request mana kar di gayi hai! 🙅‍♂️" });
});

app.get("/friends/:userId", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).populate("friends", "username profilePic");
        res.json(user ? user.friends : []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


//UNFRIEND
app.post("/unfriend", authMiddleware, async (req, res) => {
    try {
        const myId = req.userId; // ✅ token se lo
        const { friendId } = req.body;
        await User.findByIdAndUpdate(myId, { $pull: { friends: friendId } });
        await User.findByIdAndUpdate(friendId, { $pull: { friends: myId } });

        await FriendRequest.deleteMany({
            $or: [
                { sender: myId, receiver: friendId },
                { sender: friendId, receiver: myId }
            ]
        });

        res.json({ message: "Dosti toot gayi! Katti! 💔" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//BLOCK
app.post("/block-user", authMiddleware, async (req, res) => {
    try {
        const myId    = req.userId; // token se
        const { blockId } = req.body;
        
        await User.findByIdAndUpdate(myId, { 
            $addToSet: { blockedUsers: blockId },
            $pull: { friends: blockId }
        });
        await User.findByIdAndUpdate(blockId, { 
            $pull: { friends: myId } 
        });
        // Friend request bhi delete karo
        await FriendRequest.deleteMany({
            $or: [
                { sender: myId, receiver: blockId },
                { sender: blockId, receiver: myId }
            ]
        });
        res.json({ message: "User block ho gaya 🚫" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get("/users/:myId", async (req, res) => {
    try {
        const { myId } = req.params;
        const currentUser = await User.findById(myId);
        if (!currentUser) return res.status(404).json({ error: "Banda nahi mil raha" });

        const blockedByMe = currentUser.blockedUsers || [];
        const users = await User.find({
            $and: [
                { _id: { $ne: myId } },
                { _id: { $nin: blockedByMe } },
                { blockedUsers: { $ne: myId } }
            ]
        }).select("-password");
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- 9. ADMIN PANEL ROUTES ---

app.get("/admin/users",  async (req, res) => {
    const users = await User.find();
    res.json(users);
});

app.post("/admin/activate/:id",  async (req, res) => {
    await User.findByIdAndUpdate(req.params.id, { isActive: true });
    res.json("Chalo! User ko permission mil gayi ✅");
});

app.post("/admin/deactivate/:id",  async (req, res) => {
    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json("User ki chutti! Account band ❌");
});

app.delete("/admin/delete/:id",  async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        await Post.deleteMany({ userId: req.params.id });
        res.json({ message: "Khatam, Tata, Bye-Bye! User delete ho gaya 🗑️" });
    } catch (err) {
        res.status(500).json({ message: "Delete nahi ho paya ❌" });
    }
});

// --- 10. MESSAGE ROUTES ---

app.post("/message", authMiddleware, async (req, res) => {
    try {
        const senderId = req.userId;
        const { receiverId, message } = req.body;

        const newMessage = new Message({ senderId, receiverId, message });
        await newMessage.save();

        await createNotification({
            sender: senderId,
            recipient: receiverId,
            type: "message",
            message: "sent you a message"
        });

        res.status(201).json(newMessage);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/messages/:userId1/:userId2", async (req, res) => {
    try {
        const { userId1, userId2 } = req.params;
        const messages = await Message.find({
            $or: [
                { senderId: userId1, receiverId: userId2 },
                { senderId: userId2, receiverId: userId1 }
            ]
        }).sort({ createdAt: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/chat-users/:myId", async (req, res) => {
    try {
        const { myId } = req.params;
        const currentUser = await User.findById(myId);
        if (!currentUser) return res.status(404).json({ error: "User nahi mila" });

        const blockedByMe = currentUser.blockedUsers || [];
        const users = await User.find({
            $and: [
                { _id: { $ne: myId } },
                { _id: { $nin: blockedByMe } },
                { blockedUsers: { $ne: myId } }
            ]
        }).select("-password");

        const usersWithTime = await Promise.all(users.map(async (user) => {
            const lastMsg = await Message.findOne({
                $or: [
                    { senderId: myId, receiverId: user._id },
                    { senderId: user._id, receiverId: myId }
                ]
            }).sort({ createdAt: -1 });

            return {
                ...user.toObject(),
                lastMessageTime: lastMsg ? lastMsg.createdAt : null,
                lastMessageText: lastMsg ? lastMsg.message : null
            };
        }));

        usersWithTime.sort((a, b) => {
            if (!a.lastMessageTime && !b.lastMessageTime) return 0;
            if (!a.lastMessageTime) return 1;
            if (!b.lastMessageTime) return -1;
            return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
        });

        res.json(usersWithTime);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/unread-count/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const count = await Message.countDocuments({ receiverId: userId, read: false });
        res.json({ count });
    } catch (err) {
        console.error("Unread count error:", err);
        res.status(500).json({ count: 0 });
    }
});

// --- 11. NOTIFICATION ROUTES ---
// ⚠️ IMPORTANT: /notifications/read PEHLE hona chahiye /notifications/:userId se

app.post("/notifications/read", async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: "UserId required" });

        const result = await Notification.updateMany(
            { recipient: userId, read: false },
            { $set: { read: true } }
        );

        res.status(200).json({ success: true, modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error("Update error:", err);
        res.status(500).json({ error: "Could not update notifications" });
    }
});

app.get("/notifications/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) return res.status(400).json({ error: "UserId required" });

        const notifications = await Notification.find({ recipient: userId })
            .populate("sender", "username profilePic")
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        const formatted = notifications.map(n => ({
            _id: n._id,
            type: n.type,
            message: n.message,
            read: n.read,
            createdAt: n.createdAt,
            senderId: n.sender?._id,
            senderName: n.sender?.username || "User",
            senderPic: n.sender?.profilePic || ""
        }));

        res.status(200).json(formatted);
    } catch (err) {
        console.error("Fetch error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// --- 12. SOCKET.IO ---

const onlineUsers = {};

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("userOnline", (userId) => {
        onlineUsers[userId] = socket.id;
    });

    socket.on("sendMessage", (data) => {
        const receiverSocket = onlineUsers[data.receiverId];
        if (receiverSocket) {
            io.to(receiverSocket).emit("receiveMessage", data);
        }
    });

    socket.on("disconnect", () => {
        for (let userId in onlineUsers) {
            if (onlineUsers[userId] === socket.id) {
                delete onlineUsers[userId];
                break;
            }
        }
    });
});

// --- 13. START SERVER ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Bhai, server mast start ho gaya port ${PORT} pe! 🚀`);
});