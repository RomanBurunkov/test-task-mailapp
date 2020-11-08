const redis = require('redis');
const validator = require('email-validator');
const { MongoClient } = require('mongodb');
const { log, isObject } = require('./utils');

const MSG_FIELDS = {
  to: { maxLen: 100 },
  subject: { maxLen: 100 },
  message: { maxLen: 100 },
};

/**
 * Init redis client.
 * @param {Object} opts Redis client options.
 */
function initRedis(opts) {
  log(`Connecting to the Redis service on ${opts.host}:${opts.port}...`);
  const client = redis.createClient(opts);
  client.on('ready', () => log('Redis client is ready!'));
  client.on('error', (err) => log(`Redis client error: ${err}`));
  client.on('warning', (wrn) => log(`Redis client warning: ${wrn}`));
  return client;
}

/**
 * Validates message object.
 * @param {Object} msg Message object.
 * @param {string} msg.to Address to send a message.
 * @param {string} msg.subject Message subject.
 * @param {string} msg.message Message text.
 */
function validateMessage(msg) {
  if (!isObject(msg)) return false;
  // Check message fields.
  const checkFields = Object.keys(MSG_FIELDS)
    .every((f) => msg[f] && typeof msg[f] === 'string' && msg[f].length <= MSG_FIELDS[f].maxLen);
  if (!checkFields) return false;
  // Validate email address
  return validator.validate(msg.to);
}

/**
 * Creates a raw mail message from the message data.
 * @param {Object} msg Message object.
 * @param {string} msg.to Address to send a message.
 * @param {string} msg.subject Message subject.
 * @param {string} msg.message Message text.
 */
function createMailMessage(msg) {
  if (!isObject(msg)) return false;
  const str = [
    'Content-Type: text/plain; charset="UTF-8"\n',
    'MIME-Version: 1.0\n',
    'Content-Transfer-Encoding: 7bit\n',
    'to: ', msg.to, '\n',
    'subject: ', msg.subject, '\n\n',
    msg.message,
  ].join('');
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function lpush(redisClient, list, data) {
  return new Promise((res, rej) => redisClient.lpush(list, data, (e) => (e ? rej(e) : res())));
}

function lrem(redisClient, list, data) {
  return new Promise((res, rej) => redisClient.lrem(list, 1, data, (e) => (e ? rej(e) : res())));
}

function rpoplpush(redisClient, lists) {
  return new Promise((resolve, reject) => redisClient.rpoplpush(...lists, async (err, repl) => {
    if (err) return reject(err);
    if (repl === null) return resolve(null);
    try {
      return resolve(JSON.parse(repl));
    } catch (e) {
      return reject(e);
    }
  }));
}

function processQueue(redisClient, lists) {
  return !redisClient || !Array.isArray(lists) || lists.length !== 2
    ? Promise.reject(new Error('Failed to process message queue!'))
    : rpoplpush(redisClient, lists);
}

function queueMessage(redisClient, list, msg) {
  return !redisClient || !list || !isObject(msg)
    ? Promise.reject(new Error('Failed to queue a message!'))
    : lpush(redisClient, list, JSON.stringify(msg));
}

function dequeueMessage(redisClient, list, msg) {
  return !redisClient || !list || !isObject(msg)
    ? Promise.reject(new Error('Failed to dequeue a message!'))
    : lrem(redisClient, list, JSON.stringify(msg));
}

async function dbAddMessage(opts, msg) {
  const uri = `mongodb://${opts.host}:${opts.port}`;
  const client = new MongoClient(uri, { useUnifiedTopology: true });
  let result = false;
  msg.processed = 0;
  try {
    await client.connect();
    const database = client.db(opts.db);
    const collection = database.collection(opts.collection);
    result = await collection.insertOne(msg);
    await client.close();
  } catch (e) {
    await client.close();
  }
  return result;
}

/**
 * Update message doc in DB.
 * @param {Object} opts Connection options.
 * @param {string} id Document id.
 * @param {Object} data Data to update.
 */
async function dbUpdateMessage(opts, id, data) {
  const uri = `mongodb://${opts.host}:${opts.port}`;
  const client = new MongoClient(uri, { useUnifiedTopology: true });
  let result = false;
  try {
    await client.connect();
    const database = client.db(opts.db);
    const collection = database.collection(opts.collection);
    result = await collection.updateOne({ _id: id }, { $set: data });
    await client.close();
  } catch (e) {
    await client.close();
  }
  return result;
}

exports.initRedis = initRedis;
exports.dbAddMessage = dbAddMessage;
exports.processQueue = processQueue;
exports.queueMessage = queueMessage;
exports.dequeueMessage = dequeueMessage;
exports.dbUpdateMessage = dbUpdateMessage;
exports.validateMessage = validateMessage;
exports.createMailMessage = createMailMessage;
