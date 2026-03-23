import { Router } from "express";
import {
    login,
    register,
    getUserHistory,
    addToHistory,
    deleteFromHistory,
    requireAuth,
} from "../controllers/user.controller.js";

const router = Router();

// Public
router.post("/login", login);
router.post("/register", register);

// Protected — require valid token
router.get("/get_all_activity", requireAuth, getUserHistory);
router.post("/add_to_activity", requireAuth, addToHistory);
router.delete("/delete_from_activity", requireAuth, deleteFromHistory);

export default router;
