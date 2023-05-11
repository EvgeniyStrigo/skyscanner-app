import fastify, { FastifyBaseLogger, FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import websocket from '@fastify/websocket'
import moment from 'moment'
import pino from 'pino'

import { indexPage } from './index-page'

import { Skyscanner } from '../classes/skyscanner.class'
import { ISkyscannerOptions, IUserRequest, TWsLogger } from '../types/types'
import { config } from '../config'
import { ExcelXml } from '../classes/excel.class'

export class Server {
    private instance?: FastifyInstance

    private indexPage: string

    private processingRequest: boolean

    private port: number

    public static async build(logger: pino.Logger, port: number): Promise<Server> {
        const server = new Server(port)
        await server.init(logger)
        return server
    }

    constructor(port: number) {
        this.indexPage = indexPage as unknown as string
        this.processingRequest = false
        this.port = port
    }

    async init(logger: pino.Logger): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.instance = fastify({
            logger: logger as FastifyBaseLogger
        })

        await this.instance.register(helmet)
        await this.instance.register(websocket)
        this.initStaticRoutes()
        this.initWebsocketRoutes()
    }

    private initStaticRoutes() {
        if (!this.instance) {
            return
        }
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.instance.get('/', (request, reply) => {
            reply.type('text/html')
            reply.send(this.indexPage)
        })
    }

    private initWebsocketRoutes() {
        if (!this.instance) {
            return
        }

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this
        this.instance.get('/ws', { websocket: true }, function wsHandler(connection, req) {
            connection.setEncoding('utf8')

            connection.socket.on('message', async (message: Buffer) => {
                function abandon(message: string) {
                    const obj = {
                        status: 'failed',
                        message
                    }
                    connection.socket.send(JSON.stringify(obj))
                    return connection.socket.terminate()
                }

                function finish(filename: string, data: string) {
                    const obj = {
                        status: 'success',
                        message: 'processing finished, you can download file above',
                        filename,
                        data
                    }
                    connection.socket.send(JSON.stringify(obj))
                    return connection.socket.terminate()
                }

                const wsLogger: TWsLogger = (message: string) => {
                    const obj = {
                        status: 'progress',
                        message
                    }
                    connection.socket.send(JSON.stringify(obj))
                }

                try {
                    const userRequest: IUserRequest = JSON.parse(message.toString())
                    req.log.info({ userRequest })

                    if (self.processingRequest) {
                        return abandon('service is busy, try again later')
                    }
                    if (userRequest.action !== 'run') {
                        return abandon('invalid action')
                    }
                    self.processingRequest = true

                    const skyscannerOptions: Partial<ISkyscannerOptions> = {
                        apiKey: config.apiKey,
                        logger: req.log as pino.Logger,
                        wsLogger: wsLogger
                    }

                    const ss = new Skyscanner(skyscannerOptions)
                    const data = await ss.process(userRequest.journeys)
                    const report = new ExcelXml().generateSimplyReport(data)

                    finish(`skyscanner_report_${moment().format('YYYY-MM-DD_HH-mm-ss')}.xls`, report)

                    self.processingRequest = false
                } catch (err) {
                    req.log.error(err)
                    self.processingRequest = false
                    return abandon('request processing failure')
                }
            })
        })
    }

    run(): void {
        if (!this.instance) {
            return
        }
        this.instance.listen({ port: this.port }, (err) => {
            if (err) {
                throw err
            }
        })
    }
}
