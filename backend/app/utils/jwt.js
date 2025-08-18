const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET;

function generateToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, username: user.username },
    secret,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  try { 
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}


module.exports = {
  generateToken,
  verifyToken
};
