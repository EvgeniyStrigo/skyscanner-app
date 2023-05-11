import * as os from 'os'
import { crc16 } from 'crc'
import dotenv from 'dotenv'

import { IConfig } from '../types/types'
import { ARGUMENT_NO_LOCAL_ENV, DEFAULT_ENV, DEFAULT_LOG_LEVEL, DEFAULT_HTTP_PORT } from '../const'

if (!process.argv.includes(ARGUMENT_NO_LOCAL_ENV)) {
    const dtenv = dotenv.config()
    if (dtenv.error) {
        throw dtenv.error
    }
}

const env = process.env.NODE_ENV || DEFAULT_ENV

export const config: IConfig = {
    env,
    isProduction: env === DEFAULT_ENV,
    instanceId: +crc16(os.hostname() + '-' + process.pid),
    logLevel: process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL,
    httpPort: +(process.env.HTTP_PORT || DEFAULT_HTTP_PORT),
    enableCache: process.env.ENABLE_CACHE === 'true',
    apiKey: process.env.API_KEY || ''
}
