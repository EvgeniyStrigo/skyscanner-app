import fs from 'fs'
import path from 'node:path'

import fastify, {FastifyBaseLogger, FastifyInstance} from 'fastify'
import helmet from '@fastify/helmet'
import websocket from '@fastify/websocket'
import pino from 'pino'


export class Server {
    private instance?: FastifyInstance

    private indexPage: string

    private processingRequest: boolean

    private port: number;

    public static async build(logger: pino.Logger, port: number): Promise<Server> {
        const server = new Server(port)
        await server.init(logger)
        return server
    }

    constructor(port: number) {
        this.indexPage = fs.readFileSync(path.resolve(__dirname, './static/index.html'), {
            encoding: 'utf8',
            flag: 'r'
        })
        this.processingRequest = false
        this.port = port
    }

    async init(logger: pino.Logger): Promise<void> {
        // @ts-ignore
        this.instance = fastify({
            logger: logger as FastifyBaseLogger
        })

        await this.instance.register(helmet)
        await this.instance.register(websocket)
        this.initStaticRoutes()
        this.initWebsocketRoutes()
    }

    initStaticRoutes() {
        if (!this.instance) {
            return
        }
        this.instance.get('/', (request, reply) => {
            reply.type('text/html').send(this.indexPage)
        })
    }

    initWebsocketRoutes() {
        if (!this.instance) {
            return
        }
        const self = this
        this.instance.get('/ws', { websocket: true }, function wsHandler(connection, req) {
            connection.setEncoding('utf8')

            connection.socket.on('message', (message: Buffer) => {
                function abandon(message: string) {
                    const obj = {
                        status: 'failed',
                        message
                    }
                    connection.socket.send(JSON.stringify(obj))
                    return connection.socket.terminate()
                }

                function send(message: string) {
                    const obj = {
                        status: 'progress',
                        message
                    }
                    connection.socket.send(JSON.stringify(obj))
                }

                try {
                    const userRequest = JSON.parse(message.toString())
                    req.log.info({ userRequest })

                    if (self.processingRequest) {
                        return abandon('service is busy, try again later')
                    }
                    if (userRequest.action !== 'run') {
                        return abandon('invalid action')
                    }
                    self.processingRequest = true

                    send('start processing')
                    send(message.toString())

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

