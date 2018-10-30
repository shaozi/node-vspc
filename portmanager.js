// Copyright (c) 2018 jingshaochen
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT


const redis = require('redis')
const Promise = require('bluebird')
Promise.promisifyAll(redis)

const logger = require('./logger')
const CONFIG = require('./config')

var redisClient = redis.createClient({
  host: CONFIG.redis.host,
  port: CONFIG.redis.port,
  password: CONFIG.redis.password
})

const BasePort = CONFIG.telnetStartPort
const TotalPort = CONFIG.maxTelnetPorts

const availableKeyList = CONFIG.redis.keyPrefix.availablePort
const activeKeyPrefix = CONFIG.redis.keyPrefix.activeVmPort
const savedKeyPrefix = CONFIG.redis.keyPrefix.savedVmPort
const expireSeconds = CONFIG.redis.expireSeconds

var init = async function () {
  // remove all residual active ports from last run
  var keys = await redisClient.keysAsync(`${activeKeyPrefix}*`)
  if (keys.length > 0) {
    redisClient.del(keys)
  }
  // create all available ports list
  redisClient.del(availableKeyList)
  var commands = []
  for (var i = 0; i < TotalPort; i++) {
    commands.push(['rpush', availableKeyList, i + BasePort])
    //redisClient.rpush(availableKeyList, i + BasePort)
    //logger.info(`rpush ${i + BasePort}`)
  }
  await redisClient.batch(commands).execAsync()
  var portCount = await redisClient.llenAsync(availableKeyList)
  logger.info(`redis keys initializaed. ${portCount} ports available`)
}

var allocPort = async function (vmName) {
  var activeKey = `${activeKeyPrefix}${vmName}`
  var savedKey = `${savedKeyPrefix}${vmName}`

  // see if vmName is in active list
  var port = await redisClient.getAsync(activeKey)
  if (port) {
    logger.warn(`${vmName} is active but received new port request!`)
    return 0
  }
  // check if vmName is in saved list
  port = await redisClient.getAsync(savedKey)
  if (port) {
    var canReusePort = await redisClient.lremAsync(availableKeyList, 1, port)
    if (canReusePort) {
      redisClient.set(activeKey, port)
      return port
    }
  }
  // find a new port
  var newPort = await redisClient.lpopAsync(availableKeyList)
  if (!newPort) {
    throw new Error(`No more available ports for ${vmName}. Get port failed.`)
  }
  await redisClient.multi().set(activeKey, newPort).setex(savedKey, expireSeconds, newPort).execAsync()
  return newPort
}

var freePort = async function (vmName) {
  var activeKey = `${activeKeyPrefix}${vmName}`
  var port = await redisClient.getAsync(activeKey)
  if (port) {
    await redisClient.multi().del(activeKey).rpush(availableKeyList, port).execAsync()
  } else {
    logger.warn(`${activeKey} does not have a port allocated.`)
    await redisClient.delAsync(activeKey)
  }
}

module.exports = {
  init, allocPort, freePort
}