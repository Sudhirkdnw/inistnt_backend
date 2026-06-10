const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");

async function authMiddleware(req, res, next) {
    let token = req.cookies.token;

    // Support Bearer Token in Authorization Header
    if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await userModel.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        if (user.isBanned) {
            return res.status(403).json({ message: "Your account has been banned" });
        }

        userModel.updateOne({ _id: user._id }, { lastActive: new Date() }).catch(e => console.error("Last active update failed:", e.message));

        req.user = user;
        req.isAdminSession = decoded.isAdminSession === true;
        next();
    } catch (jwtErr) {
        return res.status(401).json({ message: "Invalid token, please login again" });
    }
}

async function softAuthMiddleware(req, res, next) {
    let token = req.cookies.token;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) return next();

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await userModel.findById(decoded.id);
        if (user && !user.isBanned) {
            userModel.updateOne({ _id: user._id }, { lastActive: new Date() }).catch(() => {});
            req.user = user;
        }
        next();
    } catch (err) {
        next();
    }
}

module.exports = { authMiddleware, softAuthMiddleware };