const fs = require('fs');

// Добавляем 0, для величин меньше 10.
const pad = (n) => (n < 10 ? `0${n}` : n);
// Вывод локальных даты и времени в ISO формате.
// eslint-disable-next-line prefer-template
const localIsoDate = (date = new Date()) => date.getFullYear() + '-'
  + pad(date.getMonth() + 1) + '-'
  + pad(date.getDate()) + 'T'
  + pad(date.getHours()) + ':'
  + pad(date.getMinutes()) + ':'
  + pad(date.getSeconds());

/**
 * Simple loggin function.
 * @param {string|Error} msg  Message to log.
 * @param {string} type Log type: log/error...
 */
function log(msg, type = 'log') {
  if (!msg) return;
  const isError = msg instanceof Error;
  const logType = isError ? 'error' : type;
  const msgTxt = isError ? msg.message : msg;
  console[logType](`[${localIsoDate()}] ${msgTxt}`); // eslint-disable-line no-console
}

/**
 * Load JSON data from a local file.
 * @param {string} path Path to a file.
 */
function readJsonFromFile(path) {
  return new Promise((resolve, reject) => fs.readFile(path, (err, data) => {
    if (err) return reject(err);
    try {
      return resolve(JSON.parse(data));
    } catch (error) {
      return resolve(error);
    }
  }));
}

/**
 * Load app configuration from a local file.
 * @param {string} path Path to the app configuration file.
 */
function getConfig(path = 'config.json') {
  log(`Reading configuration from ${path}...`);
  return readJsonFromFile(path);
}

/**
 * Load client secrets from a local file.
 * @param {string} path Path to Google API credentials file.
 */
function getCredentials(path = 'credentials.json') {
  log(`Reading credentials from ${path}...`);
  return readJsonFromFile(path);
}

/**
 * Load client token from a local file.
 * @param {string} path Path to Google API token.
 */
function getToken(path = 'token.json') {
  log(`Reading token from ${path}...`);
  return readJsonFromFile(path);
}

exports.log = log;
exports.getToken = getToken;
exports.getConfig = getConfig;
exports.getCredentials = getCredentials;
