require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

mongoose.connect(process.env.MONGO_URL)
  .then(async () => {
    console.log("DB connected ✅");

    const result = await User.updateOne(
      { email: "R@co.in" },   // ✅ tumhara email
      { $set: { isAdmin: true } }
    );

    console.log("Result:", result);

    if (result.modifiedCount === 1) {
      console.log("🎉 Admin ban gaya! Ab logout karke dobara login karo.");
    } else {
      console.log("⚠️ Kuch nahi badla — email check karo.");
    }

    process.exit();
  })
  .catch(err => {
    console.error("DB Error:", err);
    process.exit(1);
  });
