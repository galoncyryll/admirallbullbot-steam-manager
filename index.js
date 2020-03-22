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
var WebSocketServer = require('ws').Server;
const http = require('http');
var server = http.createServer()
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
};

// initiate steam client
const client = new SteamUser();

// authenticated client
const authClients = [];

server.listen(5000, () => {
  console.log(
    `${new Date()} Server is listening`,
  );

  // login to steam client
  client.logOn(logOnOptions);

  client.on('loggedOn', () => {
    console.log('Logged into Steam');

    // client.setPersona(SteamUser.EPersonaState.Online);
    // client.gamesPlayed(440); //team fortress game code
    // client.addFriend('76561198295244518');

  });

  client.on('friendPersonasLoaded', () => {
    const friendsData = {};
    const { myFriends } = client;

    const switcher = {
      0: 0,
      1: 1,
      5: 1,
      4: 2,
      3: 3,
      6: 3,
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

    // console.log(friendsData);
    // console.log(client.myNicknames);
  });

  client.on('friendRelationship', (sid, relationship) => {
    const switcher = {
      0: 0,
      1: 1,
      5: 1,
      4: 2,
      3: 3,
      6: 3,
    };

    const trueRelationship = switcher[relationship] || 0;
    const response = {
      event: 'FRIEND_UPDATE',
      data: {
        steamID: sid.accountid,
        relationshipStatus: trueRelationship,
      },
    };
    authClients.forEach((connection) => {
      connection.sendUTF(JSON.stringify(response));
    });
  });

  client.on('nickname', (sid, newNickname) => {
    const response = {
      event: 'FRIEND_UPDATE',
      data: {
        steamID: sid.accountid,
        nickname: newNickname,
      },
    };
    authClients.forEach((connection) => {
      connection.sendUTF(JSON.stringify(response));
    });
  });
});

// create the websocket server
var wsServer = new WebSocketServer({ server : server});


wsServer.on('connection', (request) => {
  const connection = request.accept(null, request.origin);
  console.log(`${new Date()} Connection accepted.`);

  // client -> server
  connection.on('message', (message) => {
    if (message.type !== 'utf8') return;

    let parsed = null;
    try {
      parsed = JSON.parse(message.utf8Data);
    } catch (e) {
      connection.sendUTF(
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
      connection.sendUTF(JSON.stringify(response));
      return;
    }

    let response = {};
    if (
      !['LOGIN', 'PING'].includes(parsed.event)
      && !authClients.includes(connection)
    ) {
      return;
    }

    switch (parsed.event) {
      case 'PING':
        connection.sendUTF(JSON.stringify({ event: 'PONG' }));
        return;
      case 'LOGIN':
        response = {
          event: 'RESPONSE',
          error: 'invalid token',
        };
        if (parsed.data.token === config.token) {
          authClients.push(connection);
          response.error = '';
        }
        if (parsed.nonce) response.nonce = parsed.nonce;

        connection.sendUTF(JSON.stringify(response));

        if (response.error) return;

        const friendsData = {};
        const { myFriends } = client;

        const switcher = {
          0: 0,
          1: 1,
          5: 1,
          4: 2,
          3: 3,
          6: 3,
        };

        for (const i in myFriends) {
          const relationshipStatus = switcher[myFriends[i]];

          if (!relationshipStatus) {
            console.log(myFriends[i]);
            continue;
          }

          friendsData[i] = {
            nickname: client.myNicknames[i] || '',
            relationship: relationshipStatus,
          };

          response = {
            event: 'BOGGED',
            data: friendsData,
          };

          connection.sendUTF(JSON.stringify(response));
        }
        break;
      case 'ADD_FRIEND':
        response = {
          event: 'RESPONSE',
          error: 'friend already added',
        };
        if (parsed.nonce) response.nonce = parsed.nonce;
        if (!parsed.data.steamID) {
          response.error = 'invalid steam ID';
          connection.sendUTF(JSON.stringify(response));
          return;
        }
        if (!client.myFriends[parsed.data.steamID]) {
          client.addFriend(parsed.data.steamID, (resp) => {
            response.error = resp || '';
            connection.sendUTF(JSON.stringify(response));
          });
          return;
        }

        connection.sendUTF(JSON.stringify(response));
        break;
      case 'REMOVE_FRIEND':
        response = {
          event: 'RESPONSE',
          error: 'friend not added',
        };
        if (parsed.nonce) response.nonce = parsed.nonce;
        if (!parsed.data.steamID) {
          response.error = 'invalid steam ID';
          connection.sendUTF(JSON.stringify(response));
          return;
        }
        if (client.myFriends[parsed.data.steamID]) {
          client.removeFriend(parsed.data.steamID, (resp) => {
            response.error = resp || '';
            connection.sendUTF(JSON.stringify(response));
          });
          return;
        }

        connection.sendUTF(JSON.stringify(response));
        break;
      case 'NICKNAME_FRIEND':
        response = {
          event: 'RESPONSE',
          error: 'friend not added',
        };
        if (parsed.nonce) response.nonce = parsed.nonce;
        if (!parsed.data.steamID || typeof parsed.data.nickname !== 'string') {
          response.error = 'invalid steam ID or nickname';
          connection.sendUTF(JSON.stringify(response));
          return;
        }
        if (client.myFriends[parsed.data.steamID]) {
          client.setNickname(
            parsed.data.steamID,
            parsed.data.nickname,
            (resp) => {
              response.error = resp || '';
              connection.sendUTF(JSON.stringify(response));
            },
          );
          return;
        }

        connection.sendUTF(JSON.stringify(response));
        break;
      default:
    }
  });

  connection.on('close', () => {
    if (authClients.includes(connection)) {
      authClients.filter((obj) => obj !== connection);
      console.log(`${new Date()} Connection closed.`);
    }
  });
});

process.on('SIGINT', () => {
  server.close()
  process.exit(1)
})

process.on('SIGTERM', () => {
  server.close()
  process.exit(1)
})
