const Availability = require('../models/availability');

/**
 * Create a new availability slot for a user
 * @param {Object} params
 * @param {String} params.userId - MongoDB ObjectId string
 * @param {Number} params.from - Epoch seconds (UTC)
 * @param {Number} params.to - Epoch seconds (UTC)
 * @param {String} [params.sourceTimezone] - Optional IANA timezone string
 * @returns {Promise<Object>} created availability document
 */
async function createAvailability({ userId, from, to, sourceTimezone }) {
  const availability = new Availability({ userId, from, to, sourceTimezone });
  return await availability.save();
}

/**
 * Get all availability slots for a user
 * @param {String} userId - MongoDB ObjectId string
 * @returns {Promise<Array>} list of availability documents
 */
async function getUserAvailability(userId) {
  return await Availability.find({ userId }).sort({ from: 1 }).exec();
}

/**
 * Find all users available in a given time range
 * @param {Number} from - Epoch seconds (UTC)
 * @param {Number} to - Epoch seconds (UTC)
 * @returns {Promise<Array>} list of matching availability documents
 */
async function findUsersAvailableInRange(from, to) {
  return await Availability.find({
    from: { $lt: to },
    to: { $gt: from }
  }).exec();
}

module.exports = {
  createAvailability,
  getUserAvailability,
  findUsersAvailableInRange
};
