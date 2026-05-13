const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  // Post kisne ki hai (User ID)
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  caption: { type: String },
  mediaUrl: { type: String },

  // Likes ab IDs ka array hai (Ek user ek hi baar like karega)
  likes: [{ type: String }], 

  // Comments section
  comments: [
    {
      text: String,
      userId: String, // Ye bhi add kar lo taaki pata chale comment kisne kiya
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ],

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Post", postSchema);