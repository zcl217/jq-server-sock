'use strict';

const http = require('http');
const sockjs = require('sockjs');

const sock = sockjs.createServer({ prefix: '/test' });

console.log('server created');

let rooms = new Map();
let uniqueRooms = new Set();
let users = new Map();
sock.on('connection', function (connection) {
    let curId = connection.id;
    users.set(curId, connection);

    console.log("connection made!");
    connection.on('data', function (message) {
        switch (message.type) {
            case 'CREATE_ROOM':
                handleRoomCreation();
                break;
            case 'ADD_PLAYER':
                if (!handlePlayerAdd(message)) {
                    spark.write({
                        type: 'error',
                        message: 'error in player add'
                    });
                };
                break;
            case 'UPDATE_PLAYER':
                if (!handlePlayerUpdate(message)) {
                    spark.write({
                        type: 'error',
                        message: 'error in player update'
                    });
                };
                break;
            case 'REMOVE_PLAYER':
                //this happens on disconnect
                break;
            default:
                break;

        }
        console.log(message);
    });

    connection.on('close', function () {
        handlePlayerRemove(message);
        users.delete(curId);
    });
});

const server = http.createServer();
sock.installHandlers(server, {prefix:'/test'});
const port = process.env.PORT || 3333;
server.listen(port, '0.0.0.0');

function handleRoomCreation() {
    let newRoom = generateRoomId();
    uniqueRooms.add(roomId);
    rooms.set(roomId, new Map());
    spark.write({
        type: 'roomCreated',
        roomId: newRoom
    });
}

function generateRoomId() {
    // generate a random room id from 1000 to 9999
    let max = 9999, min = 1000;
    let roomId = Math.floor(Math.random() * (max - min + 1) + min);
    while (uniqueRooms.has(roomId)) {
        roomId = Math.floor(Math.random() * (max - min + 1) + min);
    }
    return roomId;
}

function handlePlayerAdd(message) {
    let roomId = message.roomId;
    let playerId = message.playerId;
    let playerObject = message.player;
    if (!room.has(playerId)) return false;

    room.get(roomId).set(playerId, playerObject);
    return true;
}

function handlePlayerUpdate(message) {
    let roomId = message.roomId;
    let playerId = message.playerId;
    let newProperties = message.newPlayerProperties;
    if (!room.has(playerId)) return false;

    let room = room.get(roomId);
    if (!room.has(playerId)) return false;

    Object.assign(room.get(playerId), newProperties);
    return true;
}