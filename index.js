'use strict';

const http = require('http');
const sockjs = require('sockjs');

const sock = sockjs.createServer({ prefix: '/test' });

console.log('server created');

const socketTypes = {
    CREATE_ROOM: 'CREATE_ROOM',
    ROOM_CREATED: 'ROOM_CREATED',
    JOIN_ROOM: 'JOIN_ROOM',
    JOIN_ROOM_SUCCESS: 'JOIN_ROOM_SUCCESS',
    JOIN_ROOM_ERROR: 'JOIN_ROOM_ERROR',
    ADD_PLAYER: 'ADD_PLAYER',
    UPDATE_PLAYER: 'UPDATE_PLAYER',
    REMOVE_PLAYER: 'REMOVE_PLAYER',
    PLAYER_ADDED: 'PLAYER_ADDED',
    PLAYER_REMOVED:'PLAYER_REMOVED',
    UPDATE_PLAYER_LIST: 'UPDATE_PLAYER_LIST',
    UPDATE_SCENE: 'UPDATE_SCENE',
    SCENE_UPDATED: 'SCENE_UPDATED',
    INIT: 'INIT',
    ERROR: 'ERROR',
}

// a map of rooms -> users (tell us which users are in a room)
// the users is another map of connection ids -> player properties
let rooms = new Map();
// a map of users -> room (tells us which room a user is in)
let playerRoomMap = new Map();
// a map of all connections
let connectionMap = new Map();

sock.on('connection', function (connection) {
    writeMessage(connection, {
        type: socketTypes.INIT,
        connectionId: connection.id
    });
    connectionMap.set(connection.id, connection);

    console.log("connection made!");
    connection.on('data', function (rawMessage) {
        let message = JSON.parse(rawMessage);
    //    console.log(JSON.stringify(message));
        switch (message.type) {
            case socketTypes.CREATE_ROOM:
                handleRoomCreation(connection, message);
                break;
            case socketTypes.JOIN_ROOM:
                if (!handleRoomJoin(connection, message)) {
                    writeMessage(connection, {
                        type: socketTypes.JOIN_ROOM_ERROR,
                        message: 'error in room join',
                    })
                };
                break;
            case socketTypes.UPDATE_PLAYER:
                if (!handlePlayerUpdate(connection, message)) {
                    writeMessage(connection, {
                        type: socketTypes.ERROR,
                        message: 'error in player update',
                    });
                };
                break;
            case socketTypes.UPDATE_SCENE:
                if (!handleSceneUpdate(connection, message)) {
                    writeMessage(connection, {
                        type: socketTypes.ERROR,
                        message: 'error in scene update',
                    });
                };
            case socketTypes.REMOVE_PLAYER:
                //this happens on disconnect
                break;
            default:
                break;

        }
    });

    connection.on('close', function () {
        console.log("connection closed");
        //handlePlayerRemove(message);
        let playerId = connection.id;
        //might need a reverse mapping of users -> rooms,
        //or else how tf are we supposed to know 
        // which user is in which room
        if (!playerRoomMap.has(playerId)) return;
        let playerRoom = playerRoomMap.get(playerId);
        console.log(playerRoom);
        //broadcast to the player's room that the player left
        rooms.get(playerRoom).forEach((value, key) => {
            let connection = connectionMap.get(key);
            writeMessage(connection, {
                type: socketTypes.PLAYER_REMOVED,
                connectionId: connection.id
            });
        });
        // delete the player from local maps
        rooms.get(playerRoom).delete(playerId);
        playerRoomMap.delete(playerId);
        connectionMap.delete(connection.id);
    });

    
    setInterval(() => {
    // websocket.on('message', (data) => {
    //   outerVar = data;
    // })
        rooms.forEach((players, roomId) => {
            broadcastUpdatedProperties(players);
        });
    }, 16.7);
//16.7
    
});

const server = http.createServer(); 
sock.installHandlers(server, {prefix:'/test'});
const port = process.env.PORT || 3333;
console.log("Listening on port: " + port);
server.listen(port, '0.0.0.0');

function handleRoomCreation(connection, message) {
    console.log(message);
    let newRoom = generateRoomId();
   // newRoom = 1;
    console.log(newRoom);
    rooms.set(newRoom, new Map());
    let playerId = connection.id;
    let playerObject = message.player;
    rooms.get(newRoom).set(playerId, playerObject);
    playerRoomMap.set(playerId, newRoom);
    writeMessage(connection, {
        type: socketTypes.ROOM_CREATED,
        roomId: newRoom
    });
}

function generateRoomId() {
    if (rooms.size >= 9000) return rooms.size() + 1;
    // generate a random room id from 1000 to 9999
    let max = 9999, min = 1000;
    let roomId = Math.floor(Math.random() * (max - min + 1) + min);
    while (rooms.has(roomId)) {
        roomId = Math.floor(Math.random() * (max - min + 1) + min);
    }
    return roomId;
}

function handleRoomJoin(connection, message) {
    let roomId = parseInt(message.roomId);
  //  roomId = 1;
    let playerId = connection.id;
    let playerObject = message.player;
    console.log(rooms);
    if (!rooms.has(roomId)) return false;
    console.log(roomId);

    writeMessage(connection, {
        type: socketTypes.JOIN_ROOM_SUCCESS,
        roomId
    })

    let currentRoom = rooms.get(roomId);
    currentRoom.set(playerId, playerObject);
    playerRoomMap.set(playerId, roomId);
    //broadcast to the room that a player has joined
    currentRoom.forEach((value, otherConnection) => {
        // don't send to yourself
        if (otherConnection !== connection.id) {
            let connection = connectionMap.get(otherConnection);
            writeMessage(connection, {
                type: socketTypes.PLAYER_ADDED,
                connectionId: connection.id,
                player: playerObject
            });
        }
    });

    return true;
}

function handlePlayerUpdate(connection, message) {
    let roomId = playerRoomMap.get(connection.id);
    let newProperties = message.player;
    if (!rooms.has(roomId)) return false;

    let currentRoom = rooms.get(roomId);
    if (!currentRoom.has(connection.id)) return false;

    Object.assign(currentRoom.get(connection.id), newProperties);
    return true;
}

function handleSceneUpdate(connection, message) {
    let roomId = playerRoomMap.get(connection.id);
    if (!rooms.has(roomId)) return false;

    let currentRoom = rooms.get(roomId);
    if (!currentRoom.has(connection.id)) return false;

    currentRoom.forEach((value, connectionId) => {
        let connection = connectionMap.get(connectionId);
        writeMessage(connection, {
            type: socketTypes.SCENE_UPDATED,
            scene: message.scene
        })
    });
}

function broadcastUpdatedProperties(players) {
    // send each player's updated info to every player in the room
    let playerList = Array.from(players.values());
    players.forEach((value, otherConnectionId) => {
        let connection = connectionMap.get(otherConnectionId);
        writeMessage(connection, {
            type: socketTypes.UPDATE_PLAYER_LIST,
            playerList
        });
    });
}

function writeMessage(connection, message) {
    let parsedMessage = JSON.stringify(message);
    connection.write(parsedMessage);
}