import { logger } from './common/logger'
import { config } from './config'
import { Server } from './server/server'
;(async () => {
    logger.info('~~~ Starting Skyscanner App ~~~')

    const server = await Server.build(logger, config.httpPort)
    server.run()
})().catch((err) => {
    logger.error(err)
    process.exit(1)
})
