import pino from 'pino'
import moment from 'moment'

export interface IConfig {
    env: string
    isProduction: boolean
    instanceId: number
    logLevel: string
    httpPort: number
    enableCache: boolean
    apiKey: string
}

export type TWsLogger = (msg: string) => void

export interface ISkyscannerOptions {
    apiKey?: string
    logger?: pino.Logger
    wsLogger?: TWsLogger
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
}

export interface IJourney {
    group: string
    home: string[]
    destination: string[]
    adults: number
    daysLengthMin: number
    daysLengthMax: number
    fwdDates: string[]
    backDates: string[]
    childrenAges: number[]
    onlyDirect: boolean
    oneWay: boolean
    nearbyAirports: boolean
    maxTimeMinutes: number
    maxBestCount: number
    combinationActor: string
}

export interface IUserRequest {
    action: string
    journeys: IJourney[]
}

export interface IRoute {
    journey: IJourney
    query: IRouteQuery
}

export interface IRouteQuery {
    market: string
    locale: string
    currency: string
    adults: number
    childrenAges: number[]
    cabinClass: string
    nearbyAirports: boolean
    query_legs: IQueryLeg[]
}

export interface IQueryLeg {
    origin_place_id: INPlaceIDIata | INPlaceIDEntity
    destination_place_id: INPlaceIDIata | INPlaceIDEntity
    date: IDateClass
}

export interface IDateClass {
    year: number
    month: string
    day: string
}

export interface INPlaceIDIata {
    iata: string
}

export interface INPlaceIDEntity {
    entityId?: number
}

export interface ISsResponse {
    sessionToken: string
    status: string
    action: string
    content: Content
}

export type TPrice = Partial<Content>

export interface IPrice extends TPrice {
    sessionToken: string
    status: string
}

export interface IPriceWithRoute extends IPrice {
    route: IRoute
}

export interface Content {
    results: Results
    stats?: Stats
    sortingOptions: SortingOptions
}

export interface Results {
    itineraries: Record<string, ItinerariesProperty>
    legs: Record<string, LegsProperty>
    segments: Record<string, SegmentsProperty>
    places: Record<string, PlacesProperty>
    carriers?: Record<string, CarriersProperty>
    agents?: Record<string, AgentsProperty>
    alliances?: Record<string, AlliancesProperty>
}

export interface AgentsProperty {
    name: string
    type: string
    imageUrl: string
    feedbackCount: number
    rating: number
    ratingBreakdown: RatingBreakdown
    isOptimisedForMobile: boolean
}

export interface RatingBreakdown {
    customerService: number
    reliablePrices: number
    clearExtraFees: number
    easeOfBooking: number
    other: number
}

export interface AlliancesProperty {
    name: string
}

export interface CarriersProperty {
    name: string
    allianceId: string
    imageUrl: string
    iata: string
}

export interface ItinerariesProperty {
    pricingOptions: PricingOption[]
    legIds: string[]
    sustainabilityData: SustainabilityData
}

export interface PricingOption {
    price: Price
    agentIds: string[]
    items: Item[]
    transferType: string
    id: string
}

export interface Item {
    price: Price
    agentId: string
    deepLink: string
    fares: Fare[]
}

export interface Fare {
    segmentId: string
}

export interface Price {
    amount: string
    unit: Unit | null
    updateStatus: UpdateStatus | null
}

export enum Unit {
    PriceUnitUnspecified = 'PRICE_UNIT_UNSPECIFIED'
}

export enum UpdateStatus {
    PriceUpdateStatusUnspecified = 'PRICE_UPDATE_STATUS_UNSPECIFIED'
}

export interface SustainabilityData {
    isEcoContender: boolean
    ecoContenderDelta: number
}

export interface LegsProperty {
    originPlaceId: string
    destinationPlaceId: string
    departureDateTime: DateTime
    arrivalDateTime: DateTime
    durationInMinutes: number
    stopCount: number
    marketingCarrierIds: string[]
    operatingCarrierIds: string[]
    segmentIds: string[]
}

export interface DateTime {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
}

export interface PlacesProperty {
    entityId: string
    parentId: string
    name: string
    type: string
    iata: string
    coordinates: Coordinates
}

export interface Coordinates {
    latitude: number
    longitude: number
}

export interface SegmentsProperty {
    originPlaceId: string
    destinationPlaceId: string
    departureDateTime: DateTime
    arrivalDateTime: DateTime
    durationInMinutes: number
    marketingFlightNumber: string
    marketingCarrierId: string
    operatingCarrierId: string
}

export interface SortingOptions {
    best?: Est[]
    cheapest: Est[]
    fastest: Est[]
}

export interface Est {
    score: number
    itineraryId: string
}

export interface Stats {
    itineraries: StatsItineraries
}

export interface StatsItineraries {
    minDuration: number
    maxDuration: number
    total: Total
    stops: Stops
    hasChangeAirportTransfer: boolean
}

export interface Stops {
    direct: Direct
    oneStop: Direct
    twoPlusStops: Direct
}

export interface Direct {
    total: Total
    ticketTypes: TicketTypes
}

export interface TicketTypes {
    singleTicket: Total
    multiTicketNonNpt: Total
    multiTicketNpt: Total
}

export interface Total {
    count: number
    minPrice: Price
}

export interface IFetchRequestOptions {
    body?: string
}

export interface ICalculation {
    startTimestamp: number
    group: string
    flights: TFlightInfo
    links: string[]
    price: number
    rate: number
    travelDays: number
    totalFlightsDuration: number
}

export interface IFlight {
    departureDateTime: moment.Moment
    arrivalDateTime: moment.Moment
    departure: string
    change: string
    arrival: string
    duration: number
}

export type TFlightInfo = Record<string, IFlight>

export type GroupedResult = Record<string, ICalculation[]>
