function adminMiddleware(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    if (req.user.role !== "admin" && req.user.role !== "superadmin") {
        return res.status(403).json({ message: "Admin access required" });
    }

    if (!req.isAdminSession) {
        return res.status(403).json({ message: "Admin operations require OTP verification. Please login through the admin portal." });
    }

    next();
}

module.exports = adminMiddleware;
