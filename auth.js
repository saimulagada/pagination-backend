// auth.js
const jwt = require("jsonwebtoken");

const ACCESS_SECRET = process.env.ACCESS_SECRET;

if (!ACCESS_SECRET) {
  console.error("CRITICAL: ACCESS_SECRET is not defined in environment variables!");
  console.error("Please check your .env file and restart the server.");
  process.exit(1); // stop app if secret is missing
}

const authenticate = (req, res, next) => {
  // Note: headers are case-insensitive, but 'authorization' is the conventional lowercase name
  const authHeader = req.headers.authorization || req.headers.Authorization;

  console.log("Auth header:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Malformed authorization header" });
  }

  try {
    const decoded = jwt.verify(token, ACCESS_SECRET);
    req.user = decoded; // { id, role, iat, exp }
    next();
  } catch (err) {
    console.log("JWT ERROR:", err.message);
    if (err.name === "TokenExpiredError") {
      return res.status(403).json({ message: "Token has expired" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(403).json({ message: "Invalid token" });
    }
    return res.status(403).json({ message: "Authentication failed" });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ message: "No role information" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Forbidden: requires one of [${roles.join(", ")}] role(s)`
      });
    }

    next();
  };
};

module.exports = { authenticate, authorize };