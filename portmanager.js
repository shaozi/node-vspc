const redis = require('redis')
const winston = require('winston')
const CONFIG = require('./config')

const redisClient = redis.createClient({
  host: CONFIG.redis.host,
  port: CONFIG.redis.port,
  password: CONFIG.redis.password
})

const BasePort = CONFIG.telnetStartPort
const TotalPort = CONFIG.maxTelnetPorts
const FreePorts = 'FreePorts'
const VmPortMap = 'VM:Port'
// init
redisClient.del(FreePorts)
redisClient.del(VmPortMap)
for (var i = 0; i < TotalPort; i++) {
  redisClient.rpush(FreePorts, BasePort + i)
}

var findFreePort = function(callback) {
  return redisClient.rpop(FreePorts, (error, port) => {
    if (error) {
      winston.error('Port manager ran into error when finding a free port')
      throw error
    }
    callback(port)
  })
}

var freePortOfVm = function(vmName, port) {
  redisClient.hdel(VmPortMap, vmName)
  redisClient.rpush(FreePorts, port)
}

var recordPortForVm = function(vmName, port) {
  return redisClient.hset(VmPortMap, vmName, port)
}

module.exports = {
  findFreePort: findFreePort,
  freePortOfVm: freePortOfVm,
  recordPortForVm: recordPortForVm
}