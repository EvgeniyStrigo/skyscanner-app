import pino from 'pino'
import moment, { Moment } from 'moment'

import {
    Fare,
    GroupedResult,
    ICalculation,
    IFetchRequestOptions,
    IFlight,
    IJourney,
    INPlaceIDEntity,
    INPlaceIDIata,
    IPrice,
    IPriceWithRoute,
    IQueryLeg,
    IRoute,
    ISkyscannerOptions,
    ISsResponse,
    ItinerariesProperty,
    SegmentsProperty,
    TFlightInfo,
    TWsLogger
} from '../types/types'

export const defaultOptions: ISkyscannerOptions = {
    apiKey: '',
    rateTimeout: 40000,
    rateTimeoutBase: 40000,
    rateTimeoutStep: 5000,
    queueDelay: 10000,
    retryFailedRequestTimeout: 100,
    maxFailedRetries: 5,
    market: 'HR',
    locale: 'ru-RU',
    currency: 'EUR',
    cabinClass: 'CABIN_CLASS_ECONOMY',
    cacheTtlSeconds: 3 * 60 * 60, // 3 hours by default
    apiUrl: 'https://partners.api.skyscanner.net/apiservices/v3',
    nearbyRetries: 0,
    inRateTimeout: false
}

const defaultJourney: IJourney = {
    group: '',
    home: [],
    destination: [],
    adults: 1,
    daysLengthMin: 1,
    daysLengthMax: 1,
    fwdDates: [],
    backDates: [],
    childrenAges: [],
    onlyDirect: false,
    oneWay: true,
    nearbyAirports: false,
    maxTimeMinutes: 0,
    maxBestCount: 100,
    combinationActor: ''
}

export class Skyscanner {
    apiKey: string
    logger: pino.Logger
    wsLogger: TWsLogger
    rateTimeout: number
    rateTimeoutBase: number
    rateTimeoutStep: number
    queueDelay: number
    retryFailedRequestTimeout: number
    maxFailedRetries: number
    market: string
    locale: string
    currency: string
    cabinClass: string
    cacheTtlSeconds: number
    apiUrl: string
    nearbyRetries: number
    inRateTimeout: boolean
    variants: (ICalculation | null)[]
    processedRoutes: number
    processedRoutesFromCache: number
    queue: Record<string, IRoute>
    processStart?: Moment
    routesCount: number
    queueProcessing: boolean

    constructor(options: Partial<ISkyscannerOptions> = defaultOptions) {
        const opts: ISkyscannerOptions = {
            ...defaultOptions,
            ...options
        }

        if (!opts.apiKey) {
            throw new Error('no apiKey passed')
        }

        if (!opts.logger) {
            throw new Error('no logger passed')
        }

        if (!opts.wsLogger) {
            throw new Error('no wsLogger passed')
        }

        this.apiKey = opts.apiKey
        this.logger = opts.logger
        this.wsLogger = opts.wsLogger
        this.rateTimeout = opts.rateTimeout
        this.rateTimeoutBase = opts.rateTimeoutBase
        this.rateTimeoutStep = opts.rateTimeoutStep
        this.queueDelay = opts.queueDelay
        this.retryFailedRequestTimeout = opts.retryFailedRequestTimeout
        this.maxFailedRetries = opts.maxFailedRetries
        this.market = opts.market
        this.locale = opts.locale
        this.currency = opts.currency
        this.cabinClass = opts.cabinClass
        this.cacheTtlSeconds = opts.cacheTtlSeconds
        this.apiUrl = opts.apiUrl
        this.nearbyRetries = opts.nearbyRetries
        this.inRateTimeout = opts.inRateTimeout

        this.variants = []
        this.processedRoutes = 0
        this.processedRoutesFromCache = 0
        this.queue = {}
        this.routesCount = 0
        this.nearbyRetries = 0
        this.queueProcessing = false
    }

    async process(journeys: IJourney[]): Promise<GroupedResult> {
        this.log('Start processing')
        this.log({ journeys })

        this.processStart = moment()

        this.processedRoutes = 0
        this.rateTimeout = this.rateTimeoutBase
        this.inRateTimeout = false
        this.processedRoutesFromCache = 0
        this.nearbyRetries = 0
        this.variants = []
        this.queueProcessing = false

        const j = journeys.map((j) => Object.assign({}, defaultJourney, j))

        const routes = this.getAllPossibleRoutes(j)
        this.routesCount = routes.length

        this.log(`Checking ${this.routesCount} routes`)

        await this.getPrices(routes)

        await this.waitForQueue()

        const variants: ICalculation[] = this.variants.filter(Boolean) as ICalculation[]

        // clean memory
        this.variants = []

        variants.sort(
            (a, b) =>
                a.price - b.price ||
                a.rate - b.rate ||
                a.totalFlightsDuration - b.totalFlightsDuration ||
                a.startTimestamp - b.startTimestamp ||
                a.group.localeCompare(b.group)
        )
        const result = this.group(variants)

        const totalTime = moment.duration(moment().diff(this.processStart))
        const completed = moment.utc(totalTime.as('milliseconds')).format('HH:mm:ss')
        this.log(`Finished processing in ${completed}`)

        return result
    }

    getAllPossibleRoutes(journeys: IJourney[] = []) {
        return journeys.map((journey) => this.getPossibleRoutes(journey)).flat()
    }

    getPossibleRoutes(journey: IJourney): IRoute[] {
        const requests: IRoute[] = []

        journey.fwdDates.sort()
        journey.backDates.sort()

        const startDate = moment.utc(journey.fwdDates[0])
        const startDateMax =
            journey.fwdDates.length > 1
                ? moment.utc(journey.fwdDates[journey.fwdDates.length - 1]).endOf('day')
                : moment(startDate).add(1, 'days')

        let cycles, finishDate, finishDateMax

        if (journey.oneWay) {
            const duration = moment.duration(startDateMax.diff(startDate))
            cycles = Math.ceil(duration.asDays() + 1)
        } else {
            finishDate = moment.utc(journey.backDates[0])
            finishDateMax = journey.backDates[1]
                ? moment.utc(journey.backDates[1]).endOf('day')
                : moment(finishDate).add(1, 'days')
            const duration = moment.duration(finishDateMax.diff(startDate))
            cycles = Math.ceil(duration.asDays() + 1)
        }

        if (cycles < 1) {
            return []
        }

        const daysAdjustCycles = journey.daysLengthMax - journey.daysLengthMin

        const airports: string[] = []
        journey.home.forEach((src) => {
            journey.destination.forEach((dst) => {
                airports.push(`${src} ${dst}`)
                if (!journey.oneWay) {
                    airports.push(`${dst} ${src}`)
                }
            })
        })

        const allRoutes = journey.oneWay ? airports.sort() : this.calculateAllCombinations(airports, journey)

        for (let i = 0; i < cycles; i++) {
            for (let j = 0; j <= daysAdjustCycles; j++) {
                const stDate = moment(startDate).add(i, 'days')
                if (stDate.isAfter(startDateMax)) {
                    continue
                }

                let endDate: Moment
                if (!journey.oneWay) {
                    endDate = moment(startDate).add(journey.daysLengthMin + i + j, 'days')
                    if (endDate.isBefore(finishDate) || endDate.isAfter(finishDateMax)) {
                        continue
                    }

                    const duration = moment.duration(endDate.diff(stDate))
                    const days = duration.asDays()
                    if (days < journey.daysLengthMin || days > journey.daysLengthMax) {
                        continue
                    }
                }

                allRoutes.forEach((dst: string) => {
                    const segments = dst.split(' ')
                    const query_legs: IQueryLeg[] = [
                        {
                            origin_place_id: this.getLegPlaceId(segments[0]),
                            destination_place_id: this.getLegPlaceId(segments[1]),
                            date: {
                                year: stDate.year(),
                                month: stDate.format('M'),
                                day: stDate.format('D')
                            }
                        }
                    ]

                    if (!journey.oneWay && segments.length > 2) {
                        query_legs.push({
                            origin_place_id: this.getLegPlaceId(segments[2]),
                            destination_place_id: this.getLegPlaceId(segments[3]),
                            date: {
                                year: endDate.year(),
                                month: endDate.format('M'),
                                day: endDate.format('D')
                            }
                        })
                    }

                    requests.push({
                        journey,
                        query: {
                            market: this.market,
                            locale: this.locale,
                            currency: this.currency,
                            adults: journey.adults,
                            childrenAges: journey.childrenAges,
                            cabinClass: this.cabinClass,
                            nearbyAirports: journey.nearbyAirports,
                            query_legs
                        }
                    })
                })
            }
        }
        return requests
    }

    getLegPlaceId(segment: string): INPlaceIDIata | INPlaceIDEntity {
        if (isFinite(Number(segment))) {
            return <INPlaceIDEntity>{ entityId: Number(segment) }
        }

        return <INPlaceIDIata>{ iata: segment }
    }

    calculateAllCombinations(myArray: string[], journey: IJourney): string[] {
        const home = journey.home
        const destination = journey.destination

        //Return removed duplicates
        return Array.from(new Set(myArray.map((i) => myArray.map((j) => (i === j ? null : [i, j]))).flat()))
            .filter(
                (i) =>
                    Array.isArray(i) &&
                    i.length === 2 &&
                    !!home.find((h) => i[0].startsWith(h)) &&
                    !!destination.find((h) => i[0].endsWith(h)) &&
                    !!home.find((h) => i[1].endsWith(h)) &&
                    !!destination.find((h) => i[1].startsWith(h))
            )
            .map((i) => (i ? i.join(' ') : ''))
            .filter(Boolean)
            .sort()
    }

    async getPrices(routes: IRoute[] = []): Promise<void> {
        this.queueProcessing = false

        const interval = setInterval(this.processQueue.bind(this), this.queueDelay)

        for (const route of routes) {
            await this.getPrice(route)
        }

        clearInterval(interval)
    }

    async getPrice(route: IRoute) {
        /*const cachedPrice = await this.isPriceForRouteCached(route)
        if (cachedPrice) {
            cachedPrice.route = route
            return this.processPriceForRoute(cachedPrice, true)
        }*/

        const price = await this.sendWithRetry(
            this.apiUrl + '/flights/live/search/create',
            {
                body: JSON.stringify({ query: route.query })
            },
            true
        )

        if (price === null) {
            return
        }

        this.logger.debug(price.status)

        if (price.status === 'RESULT_STATUS_COMPLETE') {
            const priceWithRoute: IPriceWithRoute = {
                route,
                ...price
            }
            return this.processPriceForRoute(priceWithRoute, false)
        }

        if (price.sessionToken) {
            this.queue[price.sessionToken] = route
        }
    }

    async processPriceForRoute(priceWithRoute: IPriceWithRoute, alreadyCached = false) {
        this.processedRoutes++
        this.processedRoutesFromCache += alreadyCached ? 1 : 0
        this.getVariants(priceWithRoute)

        this.showProgress(alreadyCached)
    }

    getVariants(priceWithRoute: IPriceWithRoute) {
        this.variants.push(
            ...this.findBestIteneraries(priceWithRoute).map((iteneraryId) =>
                this.getCalculation(priceWithRoute, iteneraryId)
            )
        )
    }

    findBestIteneraries(data: IPriceWithRoute) {
        const maxSegmentsCount = data.route.query.query_legs.length * (data.route.journey.onlyDirect ? 1 : 2)
        const maxBestCount = data.route.journey.maxBestCount

        try {
            if (!data.sortingOptions) {
                return []
            }
            if (!data.results) {
                return []
            }

            const fastest: string[] = []
            for (const item of data.sortingOptions.fastest) {
                const itineraryId = item.itineraryId
                const itenerary = data.results.itineraries[itineraryId] as ItinerariesProperty
                const pricingOptions = itenerary.pricingOptions.sort(
                    (a, b) => Number(a.price.amount) - Number(b.price.amount)
                )
                const items = pricingOptions[0].items.sort((a, b) => Number(a.price.amount) - Number(b.price.amount))
                const faresCount = items.reduce((acc, current) => {
                    acc += current.fares.length
                    return acc
                }, 0)
                if (faresCount > maxSegmentsCount) {
                    continue
                }

                fastest.push(itineraryId)
            }

            if (!fastest.length) {
                return []
            }

            const cheapest: string[] = []
            for (const item of data.sortingOptions.cheapest) {
                const itineraryId = item.itineraryId
                if (fastest.includes(itineraryId)) {
                    cheapest.push(itineraryId)
                }
                if (cheapest.length >= maxBestCount) {
                    break
                }
            }

            return cheapest
        } catch (err) {
            this.log(JSON.stringify(data))
            throw err
        }
    }

    getCalculation(data: IPriceWithRoute, iteneraryId: string): ICalculation | null {
        if (!data.sortingOptions) {
            return null
        }
        if (!data.results) {
            return null
        }

        const maxTimeMinutes = data.route.journey.maxTimeMinutes
        const mustHaveCalculationParts = data.route.journey.oneWay ? 1 : 2
        const maxStops = data.route.journey.onlyDirect ? 0 : 1

        const itenerary = data.results.itineraries[iteneraryId]

        const pricingOptions = itenerary.pricingOptions.sort((a, b) => Number(a.price.amount) - Number(b.price.amount))
        const pricingOption = pricingOptions[0]
        const items = pricingOption.items

        const price = +(Number(pricingOption.price.amount) / 1000).toFixed(2)
        const segments = items
            .map((item) => item.fares.map((f: Fare) => (f ? f.segmentId : '')))
            .flat()
            .filter(Boolean)

        const links = items.map((item) => {
            const myURL = new URL(item.deepLink)
            const usp = new URLSearchParams(myURL.search)
            return usp.get('u')
        })

        const legs = Array.from(new Set(itenerary.legIds))
            .map((legId) => {
                if (!(data.results && data.results.legs)) {
                    return
                }
                const leg = data.results.legs[legId]
                if (!leg) {
                    return
                }

                if (leg.stopCount > maxStops) {
                    return
                }

                const intersections = leg.segmentIds.filter((value) => segments.includes(value))

                if (intersections.length !== leg.stopCount + 1) {
                    return
                }

                if (maxTimeMinutes && leg.durationInMinutes > maxTimeMinutes) {
                    return
                }

                return leg
            })
            .filter(Boolean)

        let totalFlightsDuration = 0

        const flightKeyByIndex = ['fwd', 'back']

        const flights = legs.reduce((accumulator: TFlightInfo, leg, index) => {
            if (!(data.results && data.results.places)) {
                return accumulator
            }

            if (!(data.results && data.results.segments)) {
                return accumulator
            }

            if (!leg) {
                return accumulator
            }

            const duration = leg.durationInMinutes
            const departure = data.results.places[leg.originPlaceId].iata
            const arrival = data.results.places[leg.destinationPlaceId].iata

            let change = '-'
            if (leg.stopCount > 0) {
                const segments = leg.segmentIds
                    .map((segmentId) =>
                        data.results && data.results.segments
                            ? data.results.segments[segmentId]
                            : (null as unknown as SegmentsProperty)
                    )
                    .filter(Boolean)
                    .sort((a: SegmentsProperty, b: SegmentsProperty) => {
                        // month and time zone in this moment objects are incorrect, but enough for comparing and sorting
                        return moment(a.departureDateTime).unix() - moment(b.departureDateTime).unix()
                    })

                const segmentsTime = segments.reduce((acc, current) => {
                    acc += current.durationInMinutes
                    return acc
                }, 0)
                const changeTime = moment.duration(duration - segmentsTime, 'minutes')
                const changeTimeHumanFormat = moment.utc(changeTime.as('milliseconds')).format('H:mm')

                const stops = [
                    ...new Set(
                        segments.reduce((acc: string[], current: SegmentsProperty) => {
                            if (!(data.results && data.results.places)) {
                                return acc
                            }
                            const segmentDeparture = data.results.places[current.originPlaceId].iata
                            const segmentArrival = data.results.places[current.destinationPlaceId].iata
                            if (segmentDeparture !== departure) {
                                acc.push(segmentDeparture)
                            }
                            if (segmentArrival !== arrival) {
                                acc.push(segmentArrival)
                            }
                            return acc
                        }, []) as unknown as string[]
                    )
                ]

                change = `${stops.join('⇒')}; ${changeTimeHumanFormat}`
            }

            const direction = flightKeyByIndex[index]

            const departureDateTime = leg.departureDateTime
            const arrivalDateTime = leg.arrivalDateTime

            totalFlightsDuration += leg.durationInMinutes

            accumulator[direction] = {
                departureDateTime: moment.utc({ ...departureDateTime, month: departureDateTime.month - 1 }),
                arrivalDateTime: moment.utc({ ...arrivalDateTime, month: arrivalDateTime.month - 1 }),
                departure,
                change,
                arrival,
                duration
            } as unknown as IFlight
            return accumulator
        }, {})

        if (Object.keys(flights).length !== mustHaveCalculationParts) {
            return null
        }

        let travelDays = 1
        if (!data.route.journey.oneWay) {
            const travelDuration = moment.duration(flights.back.departureDateTime.diff(flights.fwd.arrivalDateTime))
            travelDays = +travelDuration.asDays().toFixed(2)
        }

        return {
            startTimestamp: Math.min(...Object.values(flights).map((f) => f.departureDateTime.unix())),
            group: data.route.journey.group,
            flights,
            links,
            price,
            rate: Math.round((price / travelDays) * 100) / 100,
            travelDays,
            totalFlightsDuration
        } as unknown as ICalculation
    }

    async waitForQueue(): Promise<unknown> {
        return new Promise((resolve) => {
            const i = setInterval(() => {
                if (!Object.keys(this.queue).length) {
                    clearInterval(i)
                    return resolve(true)
                }
                this.processQueue()
            }, 1000)
        })
    }

    async processQueue(): Promise<void> {
        if (this.queueProcessing) {
            return
        }
        this.queueProcessing = true
        let keys = Object.keys(this.queue)
        if (!keys.length) {
            return
        }

        this.log('start to process queue')
        while (keys.length) {
            const key = keys.shift()
            if (!key) {
                continue
            }

            const route = this.queue[key]
            if (!route) {
                continue
            }
            /*const cachedPrice = await this.isPriceForRouteCached(route)
            if (cachedPrice) {
                delete this.queue[key]
                keys = Object.keys(this.queue)
                // processing rules can be changed
                cachedPrice.route = route
                await this.processPriceForRoute(cachedPrice, true)
                continue
            }*/

            const price = await this.sendWithRetry(this.apiUrl + '/flights/live/search/poll/' + key)
            if (price) {
                delete this.queue[key]
                keys = Object.keys(this.queue)
                const priceWithRoute: IPriceWithRoute = {
                    route,
                    ...price
                }
                await this.processPriceForRoute(priceWithRoute, false)
            }
        }
        this.log('finish to process queue')
        this.queueProcessing = false
    }

    showProgress(cached = false) {
        const nonCachedRoutes = this.routesCount - this.processedRoutesFromCache
        const nonCachedProcessedRoutes = this.processedRoutes - this.processedRoutesFromCache

        const percent = +((this.processedRoutes / this.routesCount) * 100).toFixed(2)
        const realRequestsPercent = +((nonCachedProcessedRoutes / nonCachedRoutes) * 100).toFixed(2)
        const duration = moment.duration(moment().diff(this.processStart))
        const timeUsed = moment.utc(duration.as('milliseconds')).format('HH:mm:ss')
        const msPerPercent = duration.as('milliseconds') / realRequestsPercent || 0
        const etaDuration = moment.duration((100 - realRequestsPercent) * msPerPercent, 'milliseconds')
        const etaMs = etaDuration.as('milliseconds')
        const eta = etaMs && isFinite(etaMs) ? moment.utc(etaMs).format('HH:mm:ss') : 'please, wait...'

        this.log(
            `processed route ${this.processedRoutes} of ${this.routesCount} (${percent.toFixed(
                0
            )}%), time: ${timeUsed}, eta: ${eta} ${cached ? '[cached]' : ''}`
        )
    }

    group(data: ICalculation[]): GroupedResult {
        return data.reduce((accumulator: GroupedResult, current) => {
            accumulator[current.group] = accumulator[current.group] || []
            accumulator[current.group].push(current)
            return accumulator
        }, {})
    }

    sleep(millis: number): Promise<void> {
        return new Promise((resolve) => setTimeout(() => resolve(), millis))
    }

    async sendWithRetry(
        url: string,
        opts: IFetchRequestOptions = {},
        returnIncomplete = false
    ): Promise<IPrice | null> {
        const headers = {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
            Connection: 'keep-alive'
        }

        let retry = false
        let limitRetries = 0
        let failedRetries = 0

        do {
            retry = false
            const response = await fetch(url, { method: 'post', headers, ...opts })

            this.logger.debug({ url, opts, status: response.status }, 'request')

            // noinspection FallThroughInSwitchStatementJS
            switch (response.status) {
                case 429: {
                    retry = true
                    const method = (url as string).split('/')[8]
                    if (this.inRateTimeout) {
                        this.log('\t- ' + `/${method} rate limit reached, waiting for current rate timeout finished`)
                        await this.waitForRateTimeout()
                        break
                    }

                    limitRetries++
                    let timeout = this.rateTimeout //  * limitRetries
                    if (limitRetries > 1) {
                        timeout = Math.round(this.rateTimeout / 2)
                        this.rateTimeout += this.rateTimeoutStep
                    }

                    this.log('\t- ' + `/${method} rate limit reached (${limitRetries}), waiting for ${timeout} ms`)
                    this.inRateTimeout = true
                    await this.sleep(timeout)
                    this.inRateTimeout = false
                    break
                }

                case 200: {
                    try {
                        const data: ISsResponse = await response.json()

                        if (
                            !data.status ||
                            data.status === 'RESULT_STATUS_COMPLETE' ||
                            (data.status === 'RESULT_STATUS_INCOMPLETE' && returnIncomplete)
                        ) {
                            return this.cleanSsResponse(data)
                        }

                        if (data.status === 'RESULT_STATUS_INCOMPLETE') {
                            return null
                        }

                        if (data.status === 'RESULT_STATUS_FAILED') {
                            // RESULT_STATUS_FAILED
                            const optsbody = JSON.parse(opts.body || '')
                            if (optsbody && optsbody.query && optsbody.query.nearbyAirports === true) {
                                optsbody.query.nearbyAirports = false
                                opts.body = JSON.stringify(optsbody)
                                retry = true
                                const timeout = 1
                                this.nearbyRetries++
                                this.log(
                                    '\t- ' + `retrying without nearbyAirports (${this.nearbyRetries}) in ${timeout} ms`
                                )
                                await this.sleep(timeout)
                                break
                            }
                        }
                    } catch (err) {
                        this.log(err)
                    }
                }

                // all other statuses
                // eslint-disable-next-line no-fallthrough
                default: {
                    failedRetries++
                    if (failedRetries > this.maxFailedRetries) {
                        this.log('max failed requests reached')
                        return null
                    }

                    retry = true
                    const timeout = this.retryFailedRequestTimeout * failedRetries
                    this.log(
                        '\t- ' +
                            `request failed with status ${response.status} (${failedRetries}), retry in ${timeout} ms`
                    )
                    await this.sleep(timeout)
                }
            }
        } while (retry)

        return null
    }

    async waitForRateTimeout(): Promise<unknown> {
        if (!this.inRateTimeout) {
            return
        }
        return new Promise((resolve) => {
            const i = setInterval(() => {
                if (!this.inRateTimeout) {
                    clearInterval(i)
                    resolve(true)
                }
            }, 1000)
        })
    }

    cleanSsResponse(data: ISsResponse): IPrice | null {
        const p = data.content
        if (!p) {
            return null
        }
        delete p.stats
        if (p.results) {
            delete p.results.carriers
            delete p.results.agents
            delete p.results.alliances
        }
        if (p.sortingOptions) {
            delete p.sortingOptions.best
        }

        return {
            sessionToken: data.sessionToken,
            status: data.status,
            ...p
        }
    }

    log(message: unknown) {
        this.logger.info({ message })
        if (this.wsLogger) {
            const msg: string = typeof message === 'string' ? message : JSON.stringify(message)
            this.wsLogger(msg)
        }
    }
}
