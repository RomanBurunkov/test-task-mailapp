# Test Task MailApp

App should:

* Use Express, Redis, MongoDb.
* Have one route to get the following data: email address, email subject, email body.
* Validate incoming data, store it into DB and send email via Google Gmail API.
* Use Redis to place incoming emails into queue and should take them from queue one by one to send.


## Installation

Install Node, Redis & MongoDB.
bin/install.sh could help with that.

run 'npm install' to install dependencies.

Create Google API credentials for Gmail API and put credentials.json into project folder.

Run 'node gapiauth.js' to generate a toke file(follow the instructions).

Run 'npm start' to start.

For troubleshooting use 'npm run logs' to check app logs.

## Usage

App settings could be changed in config.json.

Send message example:

```
curl --location --request POST 'HOST:3000/send' \
--header 'Content-Type: application/json' \
--data-raw '{
    "to": "address@gmail.com",
    "subject": "Test email from the mailapp 11",
    "message": "This is a test email55555567"
}'
```
