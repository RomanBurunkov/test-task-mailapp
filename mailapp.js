const { Router } = require('express');
const { initExpress } = require('./server');
const { log, getConfig } = require('./utils');
const {
  initRedis, dbAddMessage, queueMessage, dequeueMessage, validateMessage, processQueue, dbUpdateMessage,
} = require('./messages');

class MAIL_APP {
  constructor() {
    this.redis = null;
    this.config = null;
    this.express = null;
    this.queueTimer = null;
    this.queueInterval = 3000;
    this.init();
  }

  /**
   * Send message middleware
   * @returns {Function} Send message middleware.
   */
  send() {
    return async (req, res) => {
      if (!validateMessage(req.body)) {
        return res.status(403).json({ status: 'nok', result: 'Message is not valid!' });
      }
      try {
        const start = Date.now();
        const result = await dbAddMessage(this.config.mongo, { start, ...req.body });
        const msg = { id: `${result.insertedId}`, start, ...req.body };
        log(`Placing new message ${msg.id} in messages queue...`);
        await queueMessage(this.redis, 'messages', msg);
        return res.status(200).json({ status: 'ok', result: msg.id });
      } catch (e) {
        return res.status(500).json({ status: 'nok', result: `${e}` });
      }
    };
  }

  router() {
    const router = Router();
    router.post('/send', this.send());
    return router;
  }

  /**
   * re-arrange a new queue check.
   */
  arrangeQueue() {
    clearTimeout(this.queueTimer);
    this.queueTimer = setTimeout(() => this.queue(), this.queueInterval);
  }

  async queue() {
    try {
      const message = await processQueue(this.redis, ['processed', 'processed']);
      if (message) {
        const update = { processed: 1, done: message.done };
        await dbUpdateMessage(this.config.mongo, message.id, update);
        await dequeueMessage(this.redis, 'processed', message);
        log(`Message ${message.id} processed...`);
      }
    } catch (error) {
      if (error) log(`Failed to process message queue: ${error}`);
    } finally {
      this.arrangeQueue();
    }
  }

  async init() {
    try {
      this.config = await getConfig(); // Loading configuration.
      this.redis = initRedis(this.config.redis); // Connecting to Redis.
      this.express = await initExpress(this.config.mailApp, this.router()); // Init web service.
      this.arrangeQueue(); // Start queue checks.
    } catch (error) {
      log(`Failed to start app: ${error}`);
    }
  }
}

exports.mailApp = new MAIL_APP();
