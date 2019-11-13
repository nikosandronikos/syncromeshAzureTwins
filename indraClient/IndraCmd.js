const { cmdTypes } = require('./cmdTypes');

const log = require('../utils/logging').log.child({module: 'IndraCmd'});

// cmd param of arrow function is a IndraCmd.
const cmdToZmq = new Map([
    [cmdTypes.arcLevel, cmd => Buffer.from([0x25, 0xFF, 0xFF, cmd.value, 0x00])],
    [cmdTypes.addGroup, cmd => Buffer.from([0x2C, 0xFF, 0xFF, cmd.value, cmd.value, 0x07])],
    [cmdTypes.delGroup, () => Buffer.from([0x2D, 0xFF, 0xFF, 0, 0, 0x07])]
]);

// TODO: This will become a representation of commands (actually messages)
// that come from the zmq subscriber port.
// Setting commands will move elsewhere (e.g. anything that uses cmdToZmq should
// be broken out of here)
class IndraCmd {
    constructor(type, smId, value) {
        if (type < 0 || type >= cmdTypes.invalidGuard) {
            throw new Error(`IndraCmd constructor, invalid type: ${type}`);
        }

        this.type = type;
        this.smId = smId;
        this.value = value;
    }

    /**
     * @param {Buffer} buf  A buffer containing data received from Indracomm
     */
    static createFromZmqMsg(buf) {
        const type = buf[0];
        const smId = buf[1];
        let value = null;

        if (buf.length >= 10) {
            // Looks like a sensor status message, which is a different format
            // than the others and doesn't have type as the first byte.
            // Message matches Sensor_Status_Strct {
            //     uint32 long_addr
            //     uint8 dev_num
            //     uint16 grp_num
            //     uint16 status_type
            //     uint8 values[0]
            // }

            const status = {
                longAddr: buf.readUInt32LE(0),
                devNum: buf.readUInt8(4),
                // -1 is used for LIGHT_STATUS so this is an int not a uint as spec says
                grpNum: buf.readInt16LE(5),
                statusType: buf.readUInt16LE(7),
                values: [...buf.slice(9)]
            };

            console.log(status);

            if (status.statusType >= cmdTypes.lightStatus && status.statusType <= cmdTypes.tempStatus) {
                log.debug(status.statusType, status.longAddr.toString(16), status.devNum, status.grpNum.toString(16), status.values);

                return new IndraCmd(status.statusType, status.longAddr, status);
            }

            log.error(status.longAddr.toString(16), status.devNum, status.grpNum.toString(16), status.values);
            log.error(status);
        }


        if (type < 0 || type >= cmdTypes.invalidGuard) {
            log.error(`Unsupported command type - type: ${type.toString('16')}`);
            log.debug(buf.toString('hex'));

            return null;
        }

        if (type === cmdTypes.arcLevel) {
            value = buf[2];
        } else if (type === cmdTypes.addGroup) {
            const offset = 2;
            const terminator = buf.indexOf(0, offset);

            if (terminator === -1) {
                throw new Error(`No null terminator in group name. Data: ${buf.toString('16')}`);
            }

            value = buf.slice(offset, terminator).toString('ascii');
        } else if (type === cmdTypes.cbusStatus) {
            // Get lots of these and don't want to pollute the log
            return null;

       } else {
            log.debug(`Ignoring command - type: ${type.toString('16')}`);
            return null;
        }

        log.debug([...buf]);


        return new IndraCmd(type, smId, value);
    }

    toZmqMsg() {
        const converter = cmdToZmq.get(cmd.type);

        return converter(this);
    }

    toString() {
        return `type: ${this.type}, smId: ${this.smId}, value: ${this.value}.`;
    }
}

module.exports = { IndraCmd };
