const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/user');
const FriendList = require('../models/friend_list');
const FriendRequest = require('../models/friend_request');
const Block = require('../models/block');

const router = express.Router();

/* ====================== helpers ====================== */

function getAuthedUserId(req) {
  return (
    (req.user && (req.user._id || req.user.id)) ||
    (req.auth && req.auth.userId) ||
    req.userId ||
    (req.session && req.session.userId) ||
    (req.cookies && (req.cookies.userId || req.cookies.uid)) ||
    null
  );
}

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,20}$/;

// Username-only resolution; emails forbidden.
// Case-insensitive exact match using collation strength:2.
async function resolveTargetUser(body) {
  if (body.userId && mongoose.isValidObjectId(body.userId)) {
    return User.findById(body.userId).exec();
  }
  const s = (body.username ?? body.target ?? '').trim();
  if (!s || s.includes('@') || !USERNAME_RE.test(s)) return null;

  return User.findOne({ username: s })
    .collation({ locale: 'en', strength: 2 })
    .exec();
}

async function isBlockedEitherWay(aId, bId) {
  const [ab, ba] = await Promise.all([
    Block.findOne({ blocker: aId, blocked: bId }).lean().exec(),
    Block.findOne({ blocker: bId, blocked: aId }).lean().exec(),
  ]);
  return Boolean(ab || ba);
}

// Ensure a friend list doc exists for userId, return it (lean if requested)
async function ensureFriendList(userId) {
  await FriendList.updateOne(
    { user: userId },
    { $setOnInsert: { user: userId, friends: [] } },
    { upsert: true }
  ).exec();
  return FriendList.findOne({ user: userId }).exec();
}

async function addFriends(aId, bId) {
  await Promise.all([
    FriendList.updateOne({ user: aId }, { $addToSet: { friends: bId } }, { upsert: true }).exec(),
    FriendList.updateOne({ user: bId }, { $addToSet: { friends: aId } }, { upsert: true }).exec(),
  ]);
}

async function removeFriends(aId, bId) {
  await Promise.all([
    FriendList.updateOne({ user: aId }, { $pull: { friends: bId } }).exec(),
    FriendList.updateOne({ user: bId }, { $pull: { friends: aId } }).exec(),
  ]);
}

function requireAuth(req, res, next) {
  const uid = getAuthedUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });
  req.authedUserId = uid.toString();
  next();
}

/* ====================== routes ====================== */

/**
 * GET /friends/list
 * Return ONLY { id, username } for each friend.
 */
router.get('/list', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const fl = await FriendList.findOne({ user: myId }).lean().exec();
    const ids = (fl?.friends || []).map((x) => new mongoose.Types.ObjectId(x));

    if (ids.length === 0) return res.json({ ok: true, friends: [] });

    const users = await User.find({ _id: { $in: ids } }, { username: 1 }).lean().exec();
    const map = new Map(users.map((u) => [u._id.toString(), u.username ?? null]));

    const friends = ids
      .map((id) => ({ id, username: map.get(id.toString()) }))
      .filter((x) => x.username !== undefined && x.username !== null);

    res.json({ ok: true, friends });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * GET /friends/requests
 * Only { id, username } are returned. No emails ever.
 */
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);

    const [incomingReqs, outgoingReqs] = await Promise.all([
      FriendRequest.find({ to: myId }).lean().exec(),
      FriendRequest.find({ from: myId }).lean().exec(),
    ]);

    const incomingIds = incomingReqs.map((r) => r.from);
    const outgoingIds = outgoingReqs.map((r) => r.to);

    const [incomingUsers, outgoingUsers] = await Promise.all([
      User.find({ _id: { $in: incomingIds } }, { username: 1 }).lean().exec(),
      User.find({ _id: { $in: outgoingIds } }, { username: 1 }).lean().exec(),
    ]);

    const inMap = new Map(incomingUsers.map((u) => [u._id.toString(), u]));
    const outMap = new Map(outgoingUsers.map((u) => [u._id.toString(), u]));

    res.json({
      ok: true,
      incoming: incomingReqs
        .map((r) => inMap.get(r.from.toString()))
        .filter(Boolean)
        .map((u) => ({ id: u._id, username: u.username ?? null })),
      outgoing: outgoingReqs
        .map((r) => outMap.get(r.to.toString()))
        .filter(Boolean)
        .map((u) => ({ id: u._id, username: u.username ?? null })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * POST /friends/request
 * Body: { userId?: string, username?: string, target?: string }
 */
router.post('/request', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const meStr = myId.toString();

    const targetUser = await resolveTargetUser(req.body);
    if (!targetUser) return res.json({ ok: true, message: 'user not found' });

    const targetId = targetUser._id;
    const targetStr = targetId.toString();
    if (meStr === targetStr) return res.json({ ok: true, message: 'cannot add yourself' });

    if (await isBlockedEitherWay(myId, targetId)) {
      return res.json({ ok: true, message: 'user not found' });
    }

    // Already friends?
    const myList = await ensureFriendList(myId);
    if (myList.friends.some((f) => f.toString() === targetStr)) {
      return res.json({ ok: true, message: 'user is already in friend list' });
    }

    // Reciprocal pending? -> auto-accept
    const reciprocal = await FriendRequest.findOne({ from: targetId, to: myId }).exec();
    if (reciprocal) {
      await addFriends(myId, targetId);
      await Promise.all([
        FriendRequest.deleteOne({ from: targetId, to: myId }).exec(),
        FriendRequest.deleteOne({ from: myId, to: targetId }).exec(),
      ]);
      return res.json({ ok: true, message: 'friend added' });
    }

    // Outgoing already exists?
    const mine = await FriendRequest.findOne({ from: myId, to: targetId }).exec();
    if (mine) return res.json({ ok: true, message: 'already have pending request to user' });

    await FriendRequest.create({ from: myId, to: targetId });
    return res.json({ ok: true, message: 'request sent' });
  } catch (err) {
    if (err?.code === 11000) {
      return res.json({ ok: true, message: 'already have pending request to user' });
    }
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * POST /friends/accept
 * Body: { userId?: string, username?: string, target?: string }
 */
router.post('/accept', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const fromUser = await resolveTargetUser(req.body);
    if (!fromUser) return res.json({ ok: true, message: 'user not found' });
    if (fromUser._id.toString() === myId.toString()) {
      return res.json({ ok: true, message: 'cannot accept yourself' });
    }

    const pending = await FriendRequest.findOne({ from: fromUser._id, to: myId }).exec();
    if (!pending) return res.json({ ok: true, message: 'user not found' });

    if (await isBlockedEitherWay(myId, fromUser._id)) {
      await FriendRequest.deleteOne({ _id: pending._id }).exec();
      return res.json({ ok: true, message: 'user not found' });
    }

    await addFriends(myId, fromUser._id);
    await Promise.all([
      FriendRequest.deleteOne({ _id: pending._id }).exec(),
      FriendRequest.deleteOne({ from: myId, to: fromUser._id }).exec(),
    ]);

    return res.json({ ok: true, message: 'friend added' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * POST /friends/decline
 * Body: { userId?: string, username?: string, target?: string }
 */
router.post('/decline', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const fromUser = await resolveTargetUser(req.body);
    if (!fromUser) return res.json({ ok: true, message: 'user not found' });
    if (fromUser._id.toString() === myId.toString()) {
      return res.json({ ok: true, message: 'cannot decline yourself' });
    }

    const deleted = await FriendRequest.deleteOne({ from: fromUser._id, to: myId }).exec();
    if (deleted.deletedCount === 0) {
      return res.json({ ok: true, message: 'user not found' });
    }
    return res.json({ ok: true, message: 'declined' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * POST /friends/cancel
 * Body: { userId?: string, username?: string, target?: string }
 */
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const user = await resolveTargetUser(req.body);
    if (!user) return res.json({ ok: true, message: 'user not found' });
    if (user._id.toString() === myId.toString()) {
      return res.json({ ok: true, message: 'cannot cancel yourself' });
    }

    const out = await FriendRequest.deleteOne({ from: myId, to: user._id }).exec();
    if (out.deletedCount === 0) {
      return res.json({ ok: true, message: 'user not found' });
    }
    return res.json({ ok: true, message: 'cancelled' });
  } catch (_err) {
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * POST /friends/remove
 * Body: { userId?: string, username?: string, target?: string }
 */
router.post('/remove', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const user = await resolveTargetUser(req.body);
    if (!user) return res.json({ ok: true, message: 'user not found' });
    if (user._id.toString() === myId.toString()) {
      return res.json({ ok: true, message: 'cannot remove yourself' });
    }

    await removeFriends(myId, user._id);
    return res.json({ ok: true, message: 'removed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * POST /friends/block
 * Body: { userId?: string, username?: string, target?: string }
 * Also removes friendship and pending requests both ways.
 */
router.post('/block', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const user = await resolveTargetUser(req.body);
    if (!user) return res.json({ ok: true, message: 'user not found' });
    if (myId.toString() === user._id.toString()) {
      return res.json({ ok: true, message: 'cannot block yourself' });
    }

    await Block.updateOne(
      { blocker: myId, blocked: user._id },
      { $setOnInsert: { blocker: myId, blocked: user._id, createdAt: new Date() } },
      { upsert: true }
    ).exec();

    await Promise.all([
      removeFriends(myId, user._id),
      FriendRequest.deleteOne({ from: myId, to: user._id }).exec(),
      FriendRequest.deleteOne({ from: user._id, to: myId }).exec(),
    ]);

    return res.json({ ok: true, message: 'blocked' });
  } catch (err) {
    if (err?.code === 11000) {
      return res.json({ ok: true, message: 'blocked' });
    }
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * POST /friends/unblock
 * Body: { userId?: string, username?: string, target?: string }
 */
router.post('/unblock', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const user = await resolveTargetUser(req.body);
    if (!user) return res.json({ ok: true, message: 'user not found' });
    if (user._id.toString() === myId.toString()) {
      return res.json({ ok: true, message: 'cannot unblock yourself' });
    }

    await Block.deleteOne({ blocker: myId, blocked: user._id }).exec();
    return res.json({ ok: true, message: 'unblocked' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

  // replace function (GET /friends/blocklist)
  router.get('/blocklist', requireAuth, async (req, res) => {
    try {
      const myId = new mongoose.Types.ObjectId(req.authedUserId);

      // find all users I have blocked
      const docs = await Block.find({ blocker: myId }, { blocked: 1 }).lean().exec();
      const ids = docs.map(d => d.blocked).filter(Boolean);

      if (ids.length === 0) {
        return res.json({ ok: true, blocked: [] });
      }

      // fetch usernames for those ids
      const users = await User.find({ _id: { $in: ids } }, { username: 1 }).lean().exec();
      const map = new Map(users.map(u => [u._id.toString(), u.username ?? null]));

      // return only entries that still resolve to a username
      const blocked = ids
        .map(id => ({ id, username: map.get(id.toString()) }))
        .filter(x => x.username !== undefined && x.username !== null);

      return res.json({ ok: true, blocked });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'internal' });
    }
  });

module.exports = router;
