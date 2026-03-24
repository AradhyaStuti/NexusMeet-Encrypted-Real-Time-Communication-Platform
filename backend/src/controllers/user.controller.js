import httpStatus from "http-status";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt";
import { Meeting } from "../models/meeting.model.js";
import { signToken, verifyToken } from "../utils/jwt.js";
import logger from "../utils/logger.js";

/**
 * Auth middleware — validates JWT from header, attaches user to req
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const requireAuth = async (req, res, next) => {
    const token = req.headers["x-auth-token"];
    if (!token) {
        return res.status(httpStatus.UNAUTHORIZED).json({ code: "AUTH_REQUIRED", message: "Authentication required" });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(httpStatus.UNAUTHORIZED).json({ code: "AUTH_INVALID", message: "Invalid or expired token" });
    }

    try {
        const user = await User.findById(decoded.id).lean();
        if (!user) {
            return res.status(httpStatus.UNAUTHORIZED).json({ code: "USER_NOT_FOUND", message: "User not found" });
        }
        req.user = user;
        next();
    } catch (e) {
        logger.error("Auth middleware failed", { requestId: req.id, error: e.message });
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ code: "AUTH_ERROR", message: "Auth check failed" });
    }
};

/**
 * POST /login — authenticate user, return signed JWT
 */
const login = async (req, res) => {
    const { username, password } = req.body;

    if (!username?.trim() || !password) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Username and password are required" });
    }

    try {
        const user = await User.findOne({ username: username.trim() });
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            logger.warn("Failed login attempt", { username: username.trim() });
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid username or password" });
        }

        // Sign JWT with user ID and username
        const token = signToken({ id: user._id.toString(), username: user.username });

        logger.info("User logged in", { username: user.username });
        return res.status(httpStatus.OK).json({ token, username: user.username, name: user.name });
    } catch (e) {
        logger.error("Login failed", { error: e.message });
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong" });
    }
};

/**
 * POST /register — create new user account
 */
const register = async (req, res) => {
    const { name, username, password } = req.body;

    if (!name?.trim() || !username?.trim() || !password) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Name, username, and password are required" });
    }

    if (password.length < 6) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Password must be at least 6 characters" });
    }

    if (username.trim().length < 3) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Username must be at least 3 characters" });
    }

    // Username format: alphanumeric + underscores only
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Username can only contain letters, numbers, and underscores" });
    }

    try {
        const existingUser = await User.findOne({ username: username.trim() });
        if (existingUser) {
            return res.status(httpStatus.CONFLICT).json({ message: "Username already taken" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: name.trim(),
            username: username.trim(),
            password: hashedPassword,
        });

        await newUser.save();
        logger.info("New user registered", { username: username.trim() });
        res.status(httpStatus.CREATED).json({ message: "Account created successfully" });
    } catch (e) {
        logger.error("Registration failed", { error: e.message });
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong" });
    }
};

/**
 * GET /get_all_activity — fetch user's meeting history (protected)
 */
const getUserHistory = async (req, res) => {
    try {
        const meetings = await Meeting.find({ user_id: req.user.username })
            .sort({ date: -1 })
            .limit(100)
            .lean();

        res.json(meetings);
    } catch (e) {
        logger.error("Fetch history failed", { error: e.message, user: req.user.username });
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Failed to fetch history" });
    }
};

/**
 * POST /add_to_activity — save meeting to history (protected)
 */
const addToHistory = async (req, res) => {
    const { meeting_code } = req.body;

    if (!meeting_code?.trim()) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Meeting code is required" });
    }

    try {
        const newMeeting = new Meeting({
            user_id: req.user.username,
            meetingCode: meeting_code.trim(),
        });

        await newMeeting.save();
        logger.info("Meeting added to history", { user: req.user.username, code: meeting_code.trim() });
        res.status(httpStatus.CREATED).json({ message: "Added to history" });
    } catch (e) {
        logger.error("Add to history failed", { error: e.message, user: req.user.username });
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Failed to save meeting" });
    }
};

/**
 * DELETE /delete_from_activity — remove meeting from history (protected)
 */
const deleteFromHistory = async (req, res) => {
    const { meeting_id } = req.body;

    if (!meeting_id) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Meeting ID is required" });
    }

    try {
        const result = await Meeting.findOneAndDelete({
            _id: meeting_id,
            user_id: req.user.username,
        });

        if (!result) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "Meeting not found" });
        }

        logger.info("Meeting deleted from history", { user: req.user.username, meetingId: meeting_id });
        res.status(httpStatus.OK).json({ message: "Meeting deleted" });
    } catch (e) {
        logger.error("Delete from history failed", { error: e.message, user: req.user.username });
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Failed to delete meeting" });
    }
};

export { login, register, getUserHistory, addToHistory, deleteFromHistory };
