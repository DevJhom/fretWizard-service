var jwt = require('jsonwebtoken');

var authenticateToken = function (req, res, next) {
  var authHeader = req.headers['authorization'];
  var token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    var decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (_err) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

module.exports = authenticateToken;
