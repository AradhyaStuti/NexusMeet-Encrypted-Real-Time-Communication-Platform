import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
            match: [/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"],
        },
        password: { type: String, required: true, minlength: 6 },
    },
    { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export { User };
