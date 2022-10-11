/// <reference types="node" />
import { EnhancedEventEmitter } from './EnhancedEventEmitter';
import { Channel } from './Channel';
import { PayloadChannel } from './PayloadChannel';
import { TransportInternal } from './Transport';
import { ProducerStat } from './Producer';
import { MediaKind, RtpCapabilities, RtpParameters } from './RtpParameters';
export declare type ConsumerOptions = {
    /**
     * The id of the Producer to consume.
     */
    producerId: string;
    /**
     * RTP capabilities of the consuming endpoint.
     */
    rtpCapabilities: RtpCapabilities;
    consumerRtpMapping?: ConsumerRtpMapping;
    producerBweFeedback?: boolean;
    /**
     * Whether the Consumer must start in paused mode. Default false.
     *
     * When creating a video Consumer, it's recommended to set paused to true,
     * then transmit the Consumer parameters to the consuming endpoint and, once
     * the consuming endpoint has created its local side Consumer, unpause the
     * server side Consumer using the resume() method. This is an optimization
     * to make it possible for the consuming endpoint to render the video as far
     * as possible. If the server side Consumer was created with paused: false,
     * mediasoup will immediately request a key frame to the remote Producer and
     * suych a key frame may reach the consuming endpoint even before it's ready
     * to consume it, generating “black” video until the device requests a keyframe
     * by itself.
     */
    paused?: boolean;
    /**
     * The MID for the Consumer. If not specified, a sequentially growing
     * number will be assigned.
     */
    mid?: string;
    /**
     * Preferred spatial and temporal layer for simulcast or SVC media sources.
     * If unset, the highest ones are selected.
     */
    preferredLayers?: ConsumerLayers;
    /**
     * Whether this Consumer should ignore DTX packets (only valid for Opus codec).
     * If set, DTX packets are not forwarded to the remote Consumer.
     */
    ignoreDtx?: Boolean;
    /**
     * Whether this Consumer should consume all RTP streams generated by the
     * Producer.
     */
    pipe?: boolean;
    /**
     * Custom application data.
     */
    appData?: Record<string, unknown>;
};
/**
 * Valid types for 'trace' event.
 */
export declare type ConsumerTraceEventType = 'rtp' | 'keyframe' | 'nack' | 'pli' | 'fir';
/**
 * 'trace' event data.
 */
export declare type ConsumerTraceEventData = {
    /**
     * Trace type.
     */
    type: ConsumerTraceEventType;
    /**
     * Event timestamp.
     */
    timestamp: number;
    /**
     * Event direction.
     */
    direction: 'in' | 'out';
    /**
     * Per type information.
     */
    info: any;
};
export declare type ConsumerScore = {
    /**
     * The score of the RTP stream of the consumer.
     */
    score: number;
    /**
     * The score of the currently selected RTP stream of the producer.
     */
    producerScore: number;
    /**
     * The scores of all RTP streams in the producer ordered by encoding (just
     * useful when the producer uses simulcast).
     */
    producerScores: number[];
};
export declare type ConsumerLayers = {
    /**
     * The spatial layer index (from 0 to N).
     */
    spatialLayer: number;
    /**
     * The temporal layer index (from 0 to N).
     */
    temporalLayer?: number;
};
export declare type ConsumerStat = {
    type: string;
    timestamp: number;
    ssrc: number;
    rtxSsrc?: number;
    kind: string;
    mimeType: string;
    packetsLost: number;
    fractionLost: number;
    packetsDiscarded: number;
    packetsRetransmitted: number;
    packetsRepaired: number;
    nackCount: number;
    nackPacketCount: number;
    pliCount: number;
    firCount: number;
    score: number;
    packetCount: number;
    byteCount: number;
    bitrate: number;
    roundTripTime?: number;
};
/**
 * Consumer type.
 */
export declare type ConsumerType = 'simple' | 'simulcast' | 'svc' | 'pipe';
export declare type ConsumerEvents = {
    transportclose: [];
    producerclose: [];
    producerpause: [];
    producerresume: [];
    score: [ConsumerScore];
    layerschange: [ConsumerLayers?];
    trace: [ConsumerTraceEventData];
    rtp: [Buffer];
    '@close': [];
    '@producerclose': [];
};
export declare type ConsumerObserverEvents = {
    close: [];
    pause: [];
    resume: [];
    score: [ConsumerScore];
    layerschange: [ConsumerLayers?];
    trace: [ConsumerTraceEventData];
};
export declare type ConsumerRtpMapping = {
    codecs: {
        payloadType: number;
        mappedPayloadType: number;
    }[];
    headerExtensions: {
        id: number;
        mappedId: number;
    }[];
};
declare type ConsumerInternal = TransportInternal & {
    consumerId: string;
};
declare type ConsumerData = {
    producerId: string;
    kind: MediaKind;
    rtpParameters: RtpParameters;
    type: ConsumerType;
};
export declare class Consumer extends EnhancedEventEmitter<ConsumerEvents> {
    #private;
    /**
     * @private
     */
    constructor({ internal, data, channel, payloadChannel, appData, paused, producerPaused, score, preferredLayers }: {
        internal: ConsumerInternal;
        data: ConsumerData;
        channel: Channel;
        payloadChannel: PayloadChannel;
        appData?: Record<string, unknown>;
        paused: boolean;
        producerPaused: boolean;
        score?: ConsumerScore;
        preferredLayers?: ConsumerLayers;
    });
    /**
     * Consumer id.
     */
    get id(): string;
    /**
     * Associated Producer id.
     */
    get producerId(): string;
    /**
     * Whether the Consumer is closed.
     */
    get closed(): boolean;
    /**
     * Media kind.
     */
    get kind(): MediaKind;
    /**
     * RTP parameters.
     */
    get rtpParameters(): RtpParameters;
    /**
     * Consumer type.
     */
    get type(): ConsumerType;
    /**
     * Whether the Consumer is paused.
     */
    get paused(): boolean;
    /**
     * Whether the associate Producer is paused.
     */
    get producerPaused(): boolean;
    /**
     * Current priority.
     */
    get priority(): number;
    /**
     * Consumer score.
     */
    get score(): ConsumerScore;
    /**
     * Preferred video layers.
     */
    get preferredLayers(): ConsumerLayers | undefined;
    /**
     * Current video layers.
     */
    get currentLayers(): ConsumerLayers | undefined;
    /**
     * App custom data.
     */
    get appData(): Record<string, unknown>;
    /**
     * Invalid setter.
     */
    set appData(appData: Record<string, unknown>);
    /**
     * Observer.
     */
    get observer(): EnhancedEventEmitter<ConsumerObserverEvents>;
    /**
     * @private
     * Just for testing purposes.
     */
    get channelForTesting(): Channel;
    /**
     * Close the Consumer.
     */
    close(): void;
    /**
     * Transport was closed.
     *
     * @private
     */
    transportClosed(): void;
    /**
     * Dump Consumer.
     */
    dump(): Promise<any>;
    /**
     * Get Consumer stats.
     */
    getStats(): Promise<Array<ConsumerStat | ProducerStat>>;
    /**
     * Pause the Consumer.
     */
    pause(): Promise<void>;
    /**
     * Resume the Consumer.
     */
    resume(): Promise<void>;
    /**
     * Set preferred video layers.
     */
    setPreferredLayers({ spatialLayer, temporalLayer }: ConsumerLayers): Promise<void>;
    /**
     * Set priority.
     */
    setPriority(priority: number): Promise<void>;
    /**
     * Unset priority.
     */
    unsetPriority(): Promise<void>;
    /**
     * Request a key frame to the Producer.
     */
    requestKeyFrame(): Promise<void>;
    /**
     * Enable 'trace' event.
     */
    enableTraceEvent(types?: ConsumerTraceEventType[]): Promise<void>;
    private handleWorkerNotifications;
}
export {};
//# sourceMappingURL=Consumer.d.ts.map