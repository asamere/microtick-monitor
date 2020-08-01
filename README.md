# Microtick Validator Monitor
Verifies that configured validator is actively signing blocks, sends SMS alerts via twilio when missed
signatures are found.
## Using
If running your own node, start the rest server with: `mtcli rest-server --laddr tcp://0.0.0.0:1317`

### Install
`npm install`

### Configure Environment
Export the following environment variables
```
TWILIO_SID # Your twilio SID
TWILIO_TOKEN # Your twilio auth token
MTNODE_BASE_URL # Base url of microtick node's REST api (http://0.0.0.0:1317/)
ALERT_PHONE # Phone number to alert
FROM_PHONE # Phone number alerts are sent from (twilio #)
CHECK_FREQUENCY # how frequently to execute main monitor loop in ms (60000)
WATCH_VALIDATOR_ADDRESS # validator address to watch (from priv_validator_key.json)
```

### Start it up
`npm run start`
