/* eslint-disable linebreak-style */
const fs = require('fs');

const randomStr = (len, arr) => {
  let ans = '';
  for (let i = len; i > 0; i--) {
    ans += arr[Math.floor(Math.random() * arr.length)];
  }
  return ans;
};

/**
 * Websocket initiate
 */
const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const WebSocketServer = require('ws').Server;
const http = require('http');
const config = require('./config.json');


if (!config.token) {
  const newToken = randomStr(15, '12345abvctroygay');
  config.token = newToken;

  fs.writeFile('./config.json', JSON.stringify(config), (err) => {
    if (err) {
      console.log(err);
    }
  });
}

const logOnOptions = {
  accountName: config.username,
  password: config.password,
  twoFactorCode: config.secret_key ? SteamTotp.generateAuthCode(config.secret_key) : null,
  logonID: 121,
};

// initiate steam client
const client = new SteamUser();

// authenticated client
const authClients = [];

const server = http.createServer();

const wss = new WebSocketServer({
  noServer: true,
});

wss.on('connection', (ws) => {
  console.log('Connection accepted.');

  // client -> server
  ws.on('message', (message) => {
    let parsed = null;
    try {
      parsed = JSON.parse(message);
    } catch (e) {
      ws.send(
        JSON.stringify({ event: 'RESPONSE', error: 'invalid JSON object' }),
      );
      return;
    }

    if (
      !parsed.event
      || ((!parsed.data || typeof parsed.data !== 'object')
        && parsed.event !== 'PING')
    ) {
      const response = { event: 'RESPONSE', error: 'invalid request' };
      if (parsed.nonce) response.nonce = parsed.nonce;
      ws.send(JSON.stringify(response));
      return;
    }

    let response = {};
    if (
      !['LOGIN', 'PING'].includes(parsed.event)
      && !authClients.includes(ws)
    ) {
      return;
    }

    switch (parsed.event) {
      case 'PING':
        ws.send(JSON.stringify({ event: 'PONG' }));
        return;
      case 'LOGIN':
        response = {
          event: 'RESPONSE',
          error: 'invalid token',
        };
        if (parsed.data.token === config.token) {
          authClients.push(ws);
          response.error = '';
        }
        if (parsed.nonce) response.nonce = parsed.nonce;

        ws.send(JSON.stringify(response));
        return;
      case 'BOGGED':
        const friendsData = {};
        const { myFriends } = client;

        const switcher = {
          0: 0,
          1: 1,
          4: 2,
          3: 3,
          6: 3,
          5: 4,
        };

        for (const i in myFriends) {
          const relationshipStatus = switcher[myFriends[i]];

          if (!relationshipStatus) {
            continue;
          }

          friendsData[i] = {
            nickname: client.myNicknames[i] || '',
            relationship: relationshipStatus,
          };
        }

        response = {
          event: 'RESPONSE',
          data: friendsData,
        };

        if (parsed.nonce) response.nonce = parsed.nonce;

        ws.send(JSON.stringify(response));
        return;
      case 'ADD_FRIEND':
        response = {
          event: 'RESPONSE',
          error: 'friend already added',
        };
        if (parsed.nonce) response.nonce = parsed.nonce;
        if (!parsed.data.steamID) {
          response.error = 'invalid steam ID';
          console.log(response);
          ws.send(JSON.stringify(response));
          return;
        }
        if (!client.myFriends[parsed.data.steamID] || client.myFriends[parsed.data.steamID] === 2) {
          client.addFriend(parsed.data.steamID, (resp) => {
            response.error = resp || '';
            console.log(response);
            ws.send(JSON.stringify(response));
          });
          return;
        }

        ws.send(JSON.stringify(response));
        console.log(response);
        return;
      case 'REMOVE_FRIEND':
        response = {
          event: 'RESPONSE',
          error: 'friend not added',
        };
        if (parsed.nonce) response.nonce = parsed.nonce;
        if (!parsed.data.steamID) {
          response.error = 'invalid steam ID';
          ws.send(JSON.stringify(response));
          return;
        }
        if (client.myFriends[parsed.data.steamID]) {
          client.removeFriend(parsed.data.steamID, (resp) => {
            response.error = resp || '';
            ws.send(JSON.stringify(response));
          });
          return;
        }

        ws.send(JSON.stringify(response));
        break;
      case 'NICKNAME_FRIEND':
        response = {
          event: 'RESPONSE',
          error: 'friend not added',
        };
        if (parsed.nonce) response.nonce = parsed.nonce;
        if (!parsed.data.steamID || typeof parsed.data.nickname !== 'string') {
          console.log(!parsed.data.steamID);
          console.log(typeof parsed.data.nickname);
          response.error = `invalid steam ID ${parsed.data.steamID} or nickname ${parsed.data.nickname}`;
          ws.send(JSON.stringify(response));
          return;
        }
        if (client.myFriends[parsed.data.steamID]) {
          client.setNickname(
            parsed.data.steamID,
            parsed.data.nickname,
            (resp) => {
              response.error = resp || '';
              ws.send(JSON.stringify(response));
            },
          );
          return;
        }

        ws.send(JSON.stringify(response));
        break;
      default:
    }
  });

  ws.on('close', () => {
    if (authClients.includes(ws)) {
      authClients.filter((obj) => obj !== ws);
      console.log('Connection closed.');
    }
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(config.port, () => {
  console.log(
    `Server is listening on ${config.port}`,
  );

  // login to steam client
  client.logOn(logOnOptions);

  client.on('loggedOn', () => {
    console.log('Logged into Steam');

    // client.setPersona(SteamUser.EPersonaState.Online);
    // client.gamesPlayed(440); // team fortress game code
    // client.addFriend('76561198295244518');
  });

  client.on('friendRelationship', (sid, relationship) => {
    if (relationship === 2) return;

    if (relationship === 5) {
      client.blockUser(sid, () => {
        client.unblockUser(sid, () => {
        });
      });
      return;
    }

    const switcher = {
      0: 0,
      1: 1,
      4: 2,
      3: 3,
      6: 3,
      5: 4,
    };

    const trueRelationship = switcher[relationship] || 0;
    const response = {
      event: 'FRIEND_UPDATE',
      data: {
        steamID: sid.getSteamID64(),
        relationshipStatus: trueRelationship,
      },
    };
    authClients.forEach((connection) => {
      connection.send(JSON.stringify(response));
    });
  });

  client.on('nickname', (sid, newNickname) => {
    const response = {
      event: 'FRIEND_UPDATE',
      data: {
        steamID: sid.getSteamID64(),
        nickname: newNickname,
      },
    };
    authClients.forEach((connection) => {
      connection.send(JSON.stringify(response));
    });
  });

  client.on('steamGuard', (domain, callback) => {
    console.log('Steam Auth Code Requested');
    callback(config.secret_key ? SteamTotp.generateAuthCode(config.secret_key) : null);
  });

  client.on('error', (err) => {
    console.log(err);
    client.relog();
  });
});

process.on('SIGINT', () => {
  server.close();
  client.logOff();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.close();
  client.logOff();
  process.exit(0);
});
