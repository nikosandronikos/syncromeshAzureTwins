/* eslint-disable no-bitwise */

const zeromq  = require('zeromq');

//const { int32ArrayToByteBuffer } = require('../utils/buffer');

const { IndraCmd } = require('./IndraCmd');

const log = require('../utils/logging').log.child({module: 'IndraClient'});

function setupDebugZmqHandlers(socket, socketName) {
    socket.on('connect', () => {
        log.info(`${socketName}: connected`);
    });

    socket.on('connect_delay', () => {
        log.debug(`${socketName}: connect_delay`);
    });

    socket.on('connect_retry', () => {
        log.debug(`${socketName}: connect_retry`);
    });

    socket.on('bind_error', (errno, bindAddr, ex) => {
        console.error(`${socketName}: bind error: ${errno}, ${bindAddr}`);
        console.error(ex);
    });

    socket.on('accept_error', () => {
        console.error(`${socketName}: Accept error (is undocumented in zmq)`);
    });
}


class IndraClient {
    constructor(gwAddr, zmqSub, zmqCmd) {
        this.zmqSubAddr = `tcp://${gwAddr}:${zmqSub}`;
        this.zmqCmdAddr = `tcp://${gwAddr}:${zmqCmd}`;
        log.info(`zmq Subscriber / Command: ${this.zmqSubAddr} / ${this.zmqCmdAddr}`);
        this.handlers = new Map();
    }

    connect() {
        this.zmqSubscriber = zeromq.socket('sub');
        setupDebugZmqHandlers(this.zmqSubscriber, 'zmqSubscriber');

        this.zmqSubscriber.on('message', buf => this._zmqMsgHandler(buf));
        this.zmqSubscriber.connect(this.zmqSubAddr);
        this.zmqSubscriber.monitor(undefined, 0)
        this.zmqSubscriber.subscribe("");

        this.zmqCommand = zeromq.socket('req');
        setupDebugZmqHandlers(this.zmqCommand, 'zmqCommand');
        this.zmqCommand.on('message', buf => log.debug(`zmqCmd response: ${buf.toString('ascii')}`));
        this.zmqCommand.connect(this.zmqCmdAddr);
    }

    disconnect() {
        if (this.zmqSubscriber) {
            this.zmqSubscriber.unmonitor();
            this.zmqSubscriber.disconnect();
            this.zmqSubscriber = null;
        }

        if (this.zmqCommand) {
            this.zmqCommand.disconnect();
            this.zmqCommand = null;
        }
    }

    /**
     * @param {cmdTypes} cmdType    Which of the commands to install handler for.
     * handler is of the  form (groupId, value) => {}
     * Where value is dependent on the type of command being issued.
     */
    onCommand(cmdType, handler) {
        this.handlers.set(cmdType, handler);
    }

    _zmqMsgHandler(buf) {
        const cmd = IndraCmd.createFromZmqMsg(buf);
        if (!cmd) return;
        log.debug(`_zmqMsgHandler: ${cmd.toString()} (${buf.toString('hex')})`);

        const handler = this.handlers.get(cmd.type);
        if (handler) handler(cmd.smId, cmd.value);
        else log.debug(`_zmqMsgHandler: No handler for command type: ${cmd.type}`);
    }

    /**
     * Sends a buffer of binary data representing a command to Indracomm via
     * the zmqCommand socket.
     * The buffer must match the byte layout of the following structure,
     * assuming unsigned ints are 32 bit:
     * typedef struct ZmqCmd_
     * {
     *     unsigned int dId = 0;     // device id
     *     unsigned int len = 0;     // length of bytes
     *     unsigned char bytes[];    // command bytes
     * } ZmqCmd;
     */
    sendZmqCmd(cmdBuffer) {
        this.zmqCommand.send(cmdBuffer, zeromq.ZMQ_DONTWAIT, (socket, error) => {
            if (error) log.error(`sendZmqCmd: Result = ${JSON.stringify(error)}`);
        });
    }

    /**
     * Send a buffer of binary data representing a command to Indracomm via
     * the zmqCommand socket and wait for a response.
     *
     * @param {Buffer} cmdBuffer    See sendZmqCmd for byte layout of cmdBuffer
     *
     * @returns {Promise} A promise that resolves with a Buffer containing the
     * response on success or rejects with an Error.
     */
    sendRecvZmqCmd(cmdBuffer) {
        return new Promise((resolve, reject) => {
            this.zmqCommand.once('message', buf => resolve(buf));

            this.zmqCommand.send(cmdBuffer, zeromq.ZMQ_DONTWAIT, (socket, error) => {
                if (error) {
                    log.error(`sendZmqCmd: Result = ${JSON.stringify(error)}`);
                    reject(error);
                }
            });
        });
    }

    /**
     * Issue a command to Indracomm via ZMQ.
     * @param {IndraCmd} cmd   Command to execute.
     */
    command(cmd) {
        log.debug(`cmd: ${JSON.stringify(cmd)}`);

        //const cmdBuffer = cmd.toZmqMsg();

        //const smId = int32ToByteBuffer(cmd.smId);
        //const len  = int32ToByteBuffer(cmdBuffer.length);

        //const zmqCmd = Buffer.concat([smId, len, cmdBuffer], smId.length + len.length + cmdBuffer.length);

        //this.sendZmqCmd(zmqCmd);
    }
}

module.exports = { IndraClient };
