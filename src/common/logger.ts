import pino from 'pino'

import { config } from '../config'

export const logger = pino({
    base: {
        ver: process.env.npm_package_version,
        pid: process.pid,
        instanceId: config.instanceId
    },
    redact: {
        censor: '*******',
        paths: []
    },
    level: config.logLevel,
    formatters: {
        level: (label: string) => {
            return { level: label }
        }
    }
    // timestamp: pino.stdTimeFunctions.unixTime,
})

export function getChildLogger(bindings: pino.Bindings, subLogger?: pino.Logger) {
    if (subLogger) {
        return subLogger.child(bindings)
    }

    return logger.child(bindings)
}

export function getDbLogger(loggerInstance: pino.Logger) {
    if (config.logLevel !== 'trace') {
        return {}
    }
    return {
        benchmark: true,
        logging: (msg: string, sqltime: number) => loggerInstance.trace({ msg, sqltime })
    }
}
