const { google } = require('googleapis');
const {
  initRedis, processQueue, dequeueMessage, queueMessage, createMailMessage,
} = require('./messages');
const {
  log, getConfig, getToken, getCredentials,
} = require('./utils');

class G_SENDER {
  constructor() {
    this.redis = null;
    this.token = null;
    this.gmail = null;
    this.config = null;
    this.credentials = null;
    this.oAuth2Client = null;
    this.queueTimer = null;
    this.queueInterval = 3000;
    this.queueSendInterval = 5000;
    this.init();
  }

  async init() {
    try {
      this.config = await getConfig();
      // Setting app options.
      this.queueInterval = this.config.gSender.queueInterval || 3000;
      this.queueSendInterval = this.config.gSender.queueSendInterval || 5000;
      log(`Queue intervals set to ${this.queueInterval}/${this.queueSendInterval}.`);
      // Google API authentication.
      this.token = await getToken(this.config.gapi.path.token);
      this.credentials = await getCredentials(this.config.gapi.path.credentials);
      this.authorize();
      // Connecting to Redis
      this.redis = initRedis(this.config.redis);
      // Start queue checks.
      this.arrangeQueue();
    } catch (error) {
      log(error);
    }
  }

  authorize() {
    log('Authorizing on Google API service...');
    // eslint-disable-next-line camelcase
    const { client_secret, client_id, redirect_uris } = this.credentials.installed;
    this.oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    this.oAuth2Client.setCredentials(this.token);
    this.gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });
  }

  send(data) {
    const raw = createMailMessage(data);
    if (raw === false) return Promise.reject(new Error('Failed to send email!'));
    const opts = { auth: this.oAuth2Client, userId: 'me', resource: { raw } };
    log(`Sending message '${data.subject}' to ${data.to}`);
    return new Promise((resolve, reject) => {
      this.gmail.users.messages.send(opts, (err, resp) => {
        if (err) {
          return reject(new Error(`Failed to send email: ${err}`));
        }
        if (resp.status !== 200) {
          return reject(new Error(`Failed to send email: ${resp.status}: ${resp.statusText}`));
        }
        return resolve();
      });
    });
  }

  /**
   * re-arrange a new queue check.
   */
  arrangeQueue(send = false) {
    clearTimeout(this.queueTimer);
    const interval = send ? this.queueSendInterval : this.queueInterval;
    this.queueTimer = setTimeout(() => this.queue(), interval);
  }

  /**
   * Process messages queue.
   * Passes messages through messages -> processing -> processed queues.
   */
  async queue() {
    let arrangeFlag = false;
    try {
      const message = await processQueue(this.redis, ['messages', 'processing']);
      if (message) {
        await this.send(message);
        await dequeueMessage(this.redis, 'processing', message);
        await queueMessage(this.redis, 'processed', { done: Date.now(), ...message });
        log(`Message ${message.id} has been sent to ${message.to}.`);
        arrangeFlag = true;
      }
    } catch (error) {
      if (error) log(`Failed to process message queue: ${error}`);
    } finally {
      this.arrangeQueue(arrangeFlag);
    }
  }
}

exports.gsender = new G_SENDER();
