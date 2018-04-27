const net = require('net')
const TELNET = require('../telnet_const')
const CONFIG = require('../config')

const client = net.createConnection({ host: CONFIG.redis.host, port: CONFIG.proxyListenPort }, () => {
  // 'connect' listener
  console.log('connected to server!')
  client.write(Buffer.concat([
    Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.VMWARE_TELNET_EXT]),
    Buffer.from([TELNET.IAC, TELNET.SB, TELNET.VMWARE_TELNET_EXT, TELNET.VM_NAME]),
    Buffer.from('vm1'),
    Buffer.from([TELNET.IAC, TELNET.SE])
  ]))
  client.write('world!\r\n')
})
client.on('data', (data) => {
  console.log(data.toString())
  if (data.toString() == 'exit') {
    client.end()
  }
})
client.on('end', () => {
  console.log('disconnected from server')
})