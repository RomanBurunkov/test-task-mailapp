const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const { log, getConfig, getCredentials } = require('./utils');

let config = {};

/**
 * Store the token
 * @param {Object} token Token object to store.
 */
function saveNewToken(path, token) {
  const data = JSON.stringify(token);
  fs.writeFile(path, data, (e) => log(e || `Token saved to ${path}`));
}

/**
 * Get and store new token after prompting for user authorization.
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 */
function getNewToken(credentials) {
  // eslint-disable-next-line camelcase
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: config.scopes,
  });
  log(`Authorize by visiting this url: ${authUrl}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => (err
      ? log(`Error retrieving access token ${err}`)
      : saveNewToken(config.path.token, token)
    ));
  });
}

getConfig()
  .then((data) => { config = data.gapi || {}; }) // Save config in global scope for further usage.
  .then(() => getCredentials(config.path.credentials))
  .then((creds) => getNewToken(creds))
  .catch((err) => log(err));
