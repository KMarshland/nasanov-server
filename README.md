# Nasanov servers

The nasanov servers consist of a reader and a writer.
While they share the same codebase (as there is significant overlap), they do live on different servers.
Which it acts as can be configured with the environment variable `MODE=writer` or `MODE=reader`

## Writer
Node server with a websocket connection to nasanov-client. 
This server’s sole responsibility is saving the data in influxdb.

## Reader
Node server with a UDP connection to influxdb (codename: nasanov-reader). 
Each nasanov-reader will, from the UDP stream of datapoints, select the ones below a certain time threshold (eg within the past second) and send those out via websocket to the habmc clients. 
We can scale the nasanov-reader horizontally as needed; back of the envelope calculations give me an expectation of each being able to handle 100-1000 concurrent clients. 

## Development
This requires: 
1. node (`brew install node`) 
2. yarn (`brew install yarn`)
3. [influxdb](https://portal.influxdata.com/downloads).
4. foreman (`gem install foreman`)

To test it out, run `npm run test`, which starts (in parallel) influxdb, a reader, a writer, and a client that both writes and reads. 

## To write as a client

See [test.js](test.js) for example code.

### Connect
1. Make a timestamp of the current time: just an integer of ms past epoch.
2. Use sha256 to digest that timestamp to hex, using the same secret key the servers use (not included here for obvious reasons).
3. Open a websocket connection to the url `wss://{server_url}/{timestamp}/{signature}`

### Send data
Send, as json, your data.
There are three required keys:
- `id`
- `mission`, the _id_ of the mission (note: this is not the same as the number). Note that you can get this by querying `https://habmc.stanfordssi.org/missions.json`
- `timestamp` Unix timestamp, in ms past epoch

Beyond these three keys, the data may have any fields you like. 
These _must_ be numeric; other data types will not work.

The following example would send four keys: `altitude_barometer`, `altitude_gps`, `latitude`, and `longitude`.
```json
{
  "id": "b82c6a52-e8fc-4e3a-91ec-36c0565d5b8f",
  "mission": 2,
  "timestamp": 1504982987976,
  
  "altitude_barometer": 1236,
  "altitude_gps": 1224,
  "latitude": 31.2351,
  "longitude": -121.8490
}
```

### Verifying that a transmission was written
After a successful write, the websocket will receive a message with the id of the transmission that was sent, eg `b82c6a52-e8fc-4e3a-91ec-36c0565d5b8f:success` or `b82c6a52-e8fc-4e3a-91ec-36c0565d5b8f:error:Why`.

### Hearbeat
Every 5 seconds, the writer will send a message with the current timestamp

## To read as a client

See [test.js](test.js) for example code.

### Connect

Make a connection to `wss://{server_url}`.
When a new transmission comes in, it will be sent through this websocket, JSON encoded.
