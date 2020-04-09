const ws = require('ws');
const client = new ws("ws://127.0.0.1:5000");
client.on('open', () => {
  client.send('{"event":"LOGIN", "data": {"token": "ct2cy1ccto23ovb"}}');
  client.send('{"event":"ADD_FRIEND", "data": {"steamID": "76561198289445926"}}');
});
client.on('message', (data) => {
  console.log(data);
});