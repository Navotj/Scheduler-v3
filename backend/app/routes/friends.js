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
    (req.user && (req.user._id || req.user.id)) ||
    (req.auth && req.auth.userId) ||
    req.userId ||
    (req.session && req.session.userId) ||
    (req.cookies && (req.cookies.userId || req.cookies.uid)) ||
    null
  );
}

/**
 * Username-only validation for any friend/block operations.
 * EMAILS ARE FOR AUTH ONLY. Under no circumstance should they be used here.
 */
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,20}$/;

/**
 * Validate an incoming user identifier.
 * Accepts:
 *  - body.userId: ObjectId string
 *  - body.username or body.target: *username only* (3-20 chars a-z A-Z 0-9 . _ -)
 *    If a string contains '@' or fails the regex, treat as not found.
 */
async function resolveTargetUser(body) {
  const USERNAME_RE = /^[a-zA-Z0-9._-]{3,20}$/;

  if (body.userId && mongoose.isValidObjectId(body.userId)) {
    return User.findById(body.userId).exec();
  }

  const s = (body.username ?? body.target ?? '').trim();
  if (!s || s.includes('@') || !USERNAME_RE.test(s)) return null;

  // Case-insensitive exact match (emails are NOT allowed here)
  // strength:2 = case-insensitive, diacritic-sensitive
  return User.findOne({ username: s })
    .collation({ locale: 'en', strength: 2 })
    .exec();
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
 * Return ONLY { id, username } for each friend. Never include email here.
 */
router.get('/list', requireAuth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.authedUserId);
    const frs = await Friendship.find({ $or: [{ u1: myId }, { u2: myId }] })
      .lean()
      .exec();

    const otherIds = frs.map((f) => (f.u1.toString() === myId.toString() ? f.u2 : f.u1));
    if (otherIds.length === 0) return res.json({ ok: true, friends: [] });

    const users = await User.find({ _id: { $in: otherIds } }, { username: 1 }).lean().exec();
    const usersMap = new Map(users.map((u) => [u._id.toString(), u]));

    const friends = otherIds
      .map((oid) => usersMap.get(oid.toString()))
      .filter(Boolean)
      .map((u) => ({ id: u._id, username: u.username ?? null }));

    res.json({ ok: true, friends });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal' });
  }
});

/**
 * GET /friends/requests
 * List incoming and outgoing pending friend requests for authed user.
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
 * Behavior:
 *  - Username-only (or userId). Any string with '@' is rejected as not found.
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
 * Body: { userId?: string, username?: string, target?: string }
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
 * Body: { userId?: string, username?: string, target?: string }
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
 * POST /friends/cancel
 * Body: { userId?: string, username?: string, target?: string }
 * Cancel my outgoing pending request TO that user.
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
 * Body: { userId?: string, username?: string, target?: string }
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
 * Body: { userId?: string, username?: string, target?: string }
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
