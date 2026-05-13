const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: String,
  email: { type: String, unique: true },
  phone: { type: String, unique: true },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  dob: Date,
  password: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  gender: {
  type: String,
  default: "Female"
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  bio: {
    type: String,
    default: ""
  },
  coverImage: {
      type: String,
      default: ""
  },
  profilePic: {
      type: String,
      default: ""
  },

});

module.exports = mongoose.model("User", userSchema);