const express = require('express');
const bodyParser = require('body-parser');
const { log } = require('./utils');

const expressError = (err, req, res, next) => {
  if (!err) return next();
  log(`Invalid Request: ${err}`);
  return res.status(403).json({ status: 'nok', result: err.message || err });
};

exports.initExpress = (opts, router) => {
  log('Starting express server...');
  const app = express();
  app.set('x-powered-by', false);
  app.use(bodyParser.json());
  app.use(expressError);
  app.use(router);
  app.use((req, res) => res.status(404).json({ status: 'nok', result: 'Not Found' }));
  return new Promise((resolve, reject) => {
    try {
      app.listen(opts.port, () => {
        log(`Server listening on port ${opts.port}`);
        resolve(app);
      });
    } catch (error) {
      reject(error);
    }
  });
};
