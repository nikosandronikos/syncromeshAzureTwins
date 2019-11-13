// Command types used by Indracomm ZMQ cmd_publisher protocol.
const cmdTypes = Object.freeze({
    arcLevel: 0x1,
    addGroup: 0x2,
    delGroup: 0x3,
    modGroup: 0x4,

    decodeGroupFile: 0x5,
    encodeDbToFile : 0x6,
    cbusStatus     : 0x7,

    lightStatus : 0x8,
    motionStatus: 0x9,
    tempStatus  : 0x10,

    invalidGuard: 0x11

});

module.exports = { cmdTypes };
