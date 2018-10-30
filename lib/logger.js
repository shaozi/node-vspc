const { createLogger, transports, format } = require('winston')
const { combine, colorize, timestamp, label, splat } = format

const logLabel = '[NODE-VSPC]'
if (!process.env.NODE_ENV || process.env.NODE_ENV != 'production') {
  // use time stamp in winston when developing
  // log timestamp
  var logger = createLogger({
    format: combine(
      colorize(),
      splat(),
      label({ label: logLabel }),
      timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      format.printf(info => `${info.label} ${info.timestamp} ${info.level}: ${info.message}`)
    ),
    transports: [
      new transports.Console()
    ]
  })
} else {
  logger = createLogger({
    format: combine(
      splat(),
      label({ label: logLabel }),
      format.printf(info => `${info.label} ${info.level}: ${info.message}`)
    ),
    transports: [
      new transports.Console()
    ]
  })
}
module.exports = logger