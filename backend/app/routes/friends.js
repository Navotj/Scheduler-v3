const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/user');
const Friendship = require('../models/friendship');
const FriendRequest = require('../models/friend_request');
const Block = require('../models/block');

const router = express.Router();

/**
 * Resolve the authenticated user id from common locations.
 */
function getAuthedUserId(req) {
  return (
    req.user?._id ||
    req.user?.id ||
    req.auth?.userId ||
    req.userId ||
    req.session?.userId ||
    res?.locals?.user?._id || // eslint-disable-line no-undef
    null
  );
}

/**
 * Validate an incoming user identifier.
 * Accepts:
 *  - body.userId: ObjectId string
 *  - body.target: email (contains '@') or username (string)
 */
async function resolveTargetUser(body) {
  if (body.userId && mongoose.isValidObjectId(body.userId)) {
    return User.findById(body.userId).exec();
  }
  if (typeof body.target === 'string' && body.target.trim()) {
    const q = body.target.trim();
    if (q.includes('@')) {
      return User.findOne({ email: q.toLowerCase() }).exec();
    }
    return User.findOne({ username: q }).exec();
  }
  return null;
}

/**
 * Check if either direction of block exists between A and B.
 */
async function isBlockedEitherWay(aId, bId) {
  const [ab, ba] = await Promise.all([
    Block.findOne({ blocker: aId, blocked: bId }).lean().exec(),
    Block.findOne({ blocker: bId, blocked: aId }).lean().exec(),
  ]);
  return Boolean(ab || ba);
}

/**
 * Get existing friendship doc (if any) between two users.
 */
async function findFriendship(aId, bId) {
  const [u1, u2] = Friendship.normalizePair(aId, bId);
  return Friendship.findOne({ u1, u2 }).exec();
}

/**
 * Require auth middleware (non-opinionated).
 */
function requireAuth(req, res, next) {
  const uid = getAuthedUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });
  req.authedUserId = uid.toString();
  next();
}

/**
 * GET /friends/list
 * List all friends of the authed user.
 */
router.get('/list', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const frs = await Friendship.find({ $or: [{ u1: myId }, { u2: myId }] })
      .lean()
      .exec();

    const otherIds = frs.map((f) => (f.u1.toString() === myId.toString() ? f.u2 : f.u1));
    const users = await User.find({ _id: { $in: otherIds } }, { email: 1, username: 1 })
      .lean()
      .exec();

    const usersMap = new Map(users.map((u) => [u._id.toString(), u]));
    const friends = otherIds
      .map((oid) => usersMap.get(oid.toString()))
      .filter(Boolean)
      .map((u) => ({ id: u._id, email: u.email, username: u.username ?? null }));

    res.json({ ok: true, friends });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * GET /friends/requests
 * List incoming and outgoing pending friend requests for authed user.
 */
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const [incoming, outgoing] = await Promise.all([
      FriendRequest.find({ to: myId }).lean().exec(),
      FriendRequest.find({ from: myId }).lean().exec(),
    ]);

    const userIds = [
      ...incoming.map((r) => r.from.toString()),
      ...outgoing.map((r) => r.to.toString()),
    ];
    const users = await User.find({ _id: { $in: userIds } }, { email: 1, username: 1 })
      .lean()
      .exec();
    const map = new Map(users.map((u) => [u._id.toString(), u]));

    res.json({
      ok: true,
      incoming: incoming
        .map((r) => map.get(r.from.toString()))
        .filter(Boolean)
        .map((u) => ({ id: u._id, email: u.email, username: u.username ?? null })),
      outgoing: outgoing
        .map((r) => map.get(r.to.toString()))
        .filter(Boolean)
        .map((u) => ({ id: u._id, email: u.email, username: u.username ?? null })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * POST /friends/request
 * Body: { target?: string, userId?: string }
 * Behavior:
 *  - If target has a pending request to me, auto-accept (create friendship & delete pending).
 *  - If already friends -> "user is already in friend list"
 *  - If blocked either way -> "user not found"
 *  - If my pending to target exists -> "already have pending request to user"
 *  - If target is me -> "cannot add yourself"
 *  - Else create pending -> "request sent"
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

    // Blocks hide existence
    if (await isBlockedEitherWay(myId, targetId)) {
      return res.json({ ok: true, message: 'user not found' });
    }

    // Already friends?
    const existingFriendship = await findFriendship(myId, targetId);
    if (existingFriendship) {
      return res.json({ ok: true, message: 'user is already in friend list' });
    }

    // Does target already have a pending request to me? -> auto-accept
    const reciprocal = await FriendRequest.findOne({ from: targetId, to: myId }).exec();
    if (reciprocal) {
      const [u1, u2] = Friendship.normalizePair(myId, targetId);
      await Friendship.updateOne(
        { u1, u2 },
        { $setOnInsert: { u1, u2, since: new Date() } },
        { upsert: true }
      ).exec();

      // Clean up both directions if any
      await Promise.all([
        FriendRequest.deleteOne({ from: targetId, to: myId }).exec(),
        FriendRequest.deleteOne({ from: myId, to: targetId }).exec(),
      ]);

      return res.json({ ok: true, message: 'friend added' });
    }

    // Do I already have a pending to target?
    const mine = await FriendRequest.findOne({ from: myId, to: targetId }).exec();
    if (mine) return res.json({ ok: true, message: 'already have pending request to user' });

    // Create new pending
    await FriendRequest.create({ from: myId, to: targetId });
    return res.json({ ok: true, message: 'request sent' });
  } catch (err) {
    if (err?.code === 11000) {
      // Unique collision on (from,to) -> treat as already pending
      return res.json({ ok: true, message: 'already have pending request to user' });
    }
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * POST /friends/accept
 * Body: { userId?: string, target?: string }
 * Accept a pending request FROM that user TO me.
 */
router.post('/accept', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const fromUser = await resolveTargetUser(req.body);
    if (!fromUser) return res.json({ ok: true, message: 'user not found' });
    if (fromUser._id.toString() === myId.toString()) {
      return res.json({ ok: true, message: 'cannot accept yourself' });
    }

    // Ensure a pending exists from fromUser -> me
    const pending = await FriendRequest.findOne({ from: fromUser._id, to: myId }).exec();
    if (!pending) return res.json({ ok: true, message: 'user not found' });

    if (await isBlockedEitherWay(myId, fromUser._id)) {
      await FriendRequest.deleteOne({ _id: pending._id }).exec();
      return res.json({ ok: true, message: 'user not found' });
    }

    const [u1, u2] = Friendship.normalizePair(myId, fromUser._id);
    await Friendship.updateOne(
      { u1, u2 },
      { $setOnInsert: { u1, u2, since: new Date() } },
      { upsert: true }
    ).exec();

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
 * Body: { userId?: string, target?: string }
 * Decline a pending request FROM that user TO me.
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
 * POST /friends/remove
 * Body: { userId?: string, target?: string }
 * Remove friendship (both sides).
 */
router.post('/remove', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const user = await resolveTargetUser(req.body);
    if (!user) return res.json({ ok: true, message: 'user not found' });
    if (user._id.toString() === myId.toString()) {
      return res.json({ ok: true, message: 'cannot remove yourself' });
    }

    const [u1, u2] = Friendship.normalizePair(myId, user._id);
    const out = await Friendship.deleteOne({ u1, u2 }).exec();
    if (out.deletedCount === 0) {
      return res.json({ ok: true, message: 'user not found' });
    }
    return res.json({ ok: true, message: 'removed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * POST /friends/block
 * Body: { userId?: string, target?: string }
 * Create a block (me -> user). Also removes friendship and pending requests both ways.
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

    const [u1, u2] = Friendship.normalizePair(myId, user._id);
    await Promise.all([
      Friendship.deleteOne({ u1, u2 }).exec(),
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
 * Body: { userId?: string, target?: string }
 * Remove a block (me -> user).
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

module.exports = router;
