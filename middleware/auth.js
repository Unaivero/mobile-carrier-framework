const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    // Skip auth for development or if JWT_SECRET is not set
    if (process.env.NODE_ENV === 'development' || !process.env.JWT_SECRET) {
        return next();
    }

    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({
            error: 'Access denied',
            message: 'No token provided'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({
            error: 'Invalid token',
            message: 'Token is invalid or expired'
        });
    }
};

module.exports = authMiddleware;
