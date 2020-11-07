const redis = require('redis');
const { google } = require('googleapis');
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
      log(`Connecting to Redis on ${this.config.redis.host}:${this.config.redis.port}...`);
      this.redis = redis.createClient(this.config.redis);
      this.redis.on('ready', () => log('Redis client is ready!'));
      this.redis.on('error', (err) => log(`Redis client error: ${err}`));
      this.redis.on('warning', (wrn) => log(`Redis client warning: ${wrn}`));
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

  static createMessage(data = {}) {
    const str = [
      'Content-Type: text/plain; charset="UTF-8"\n',
      'MIME-Version: 1.0\n',
      'Content-Transfer-Encoding: 7bit\n',
      'to: ', data.to, '\n',
      'subject: ', data.subject, '\n\n',
      data.message,
    ].join('');
    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  }

  send(data) {
    const raw = G_SENDER.createMessage(data);
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

  queue() {
    this.redis.rpoplpush('messages', 'processing', async (err, repl) => {
      if (err) {
        this.arrangeQueue();
        return log(`Redis RPOPLPUSH error: ${err}`);
      }
      if (repl === null) return this.arrangeQueue();
      try {
        const message = JSON.parse(repl);
        await this.send(message);
        this.redis.lrem('processing', 1, repl, (procErr) => {
          if (procErr) return log('Failed to remove message from processing list!');
          return this.redis.lpush('processed', repl);
        });
        log(`Message '${message.subject}' has been sent to ${message.to}.`);
        return this.arrangeQueue(true);
      } catch (error) {
        log(`Failed to parse message ${repl}: ${error}`);
        this.redis.lrem('processing', 1, repl);
        return this.arrangeQueue();
      }
    });
  }
}

exports.gsender = new G_SENDER();
