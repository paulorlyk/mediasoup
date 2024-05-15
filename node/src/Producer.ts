import { Logger } from './Logger';
import { EnhancedEventEmitter } from './enhancedEvents';
import { Channel } from './Channel';
import { TransportInternal } from './Transport';
import { MediaKind, RtpParameters, parseRtpParameters } from './RtpParameters';
import { Event, Notification } from './fbs/notification';
import { parseRtpStreamRecvStats, RtpStreamRecvStats } from './RtpStream';
import { AppData } from './types';
import * as utils from './utils';
import { TraceDirection as FbsTraceDirection } from './fbs/common';
import * as FbsNotification from './fbs/notification';
import * as FbsRequest from './fbs/request';
import * as FbsTransport from './fbs/transport';
import * as FbsProducer from './fbs/producer';
import * as FbsProducerTraceInfo from './fbs/producer/trace-info';
import * as FbsRtpParameters from './fbs/rtp-parameters';

export type ProducerOptions<ProducerAppData extends AppData = AppData> = {
	/**
	 * Producer id (just for Router.pipeToRouter() method).
	 */
	id?: string;

	/**
	 * Media kind ('audio' or 'video').
	 */
	kind: MediaKind;

	/**
	 * RTP parameters defining what the endpoint is sending.
	 */
	rtpParameters: RtpParameters;

	/**
	 * Whether the producer must start in paused mode. Default false.
	 */
	paused?: boolean;

	/**
	 * Just for video. Time (in ms) before asking the sender for a new key frame
	 * after having asked a previous one. Default 0.
	 */
	keyFrameRequestDelay?: number;

	/**
	 * Custom application data.
	 */
	appData?: ProducerAppData;
};

/**
 * Valid types for 'trace' event.
 */
export type ProducerTraceEventType =
	| 'rtp'
	| 'keyframe'
	| 'nack'
	| 'pli'
	| 'fir'
	| 'sr';

/**
 * 'trace' event data.
 */
export type ProducerTraceEventData = {
	/**
	 * Trace type.
	 */
	type: ProducerTraceEventType;

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

export type ProducerScore = {
	/**
	 * Index of the RTP stream in the rtpParameters.encodings array.
	 */
	encodingIdx: number;

	/**
	 * SSRC of the RTP stream.
	 */
	ssrc: number;

	/**
	 * RID of the RTP stream.
	 */
	rid?: string;

	/**
	 * The score of the RTP stream.
	 */
	score: number;
};

export type ProducerVideoOrientation = {
	/**
	 * Whether the source is a video camera.
	 */
	camera: boolean;

	/**
	 * Whether the video source is flipped.
	 */
	flip: boolean;

	/**
	 * Rotation degrees (0, 90, 180 or 270).
	 */
	rotation: number;
};

export type ProducerStat = RtpStreamRecvStats;

/**
 * Producer type.
 */
export type ProducerType = 'simple' | 'simulcast' | 'svc';

export type ProducerEvents = {
	transportclose: [];
	score: [ProducerScore[]];
	videoorientationchange: [ProducerVideoOrientation];
	trace: [ProducerTraceEventData];
	listenererror: [string, Error];
	// Private events.
	'@close': [];
};

export type ProducerObserverEvents = {
	close: [];
	pause: [];
	resume: [];
	score: [ProducerScore[]];
	videoorientationchange: [ProducerVideoOrientation];
	trace: [ProducerTraceEventData];
};

type ProducerDump = {
	id: string;
	kind: string;
	type: ProducerType;
	rtpParameters: RtpParameters;
	rtpMapping: any;
	rtpStreams: any;
	traceEventTypes: string[];
	paused: boolean;
};

type ProducerInternal = TransportInternal & {
	producerId: string;
};

type ProducerData = {
	kind: MediaKind;
	rtpParameters: RtpParameters;
	type: ProducerType;
	consumableRtpParameters: RtpParameters;
};

const logger = new Logger('Producer');

export class Producer<
	ProducerAppData extends AppData = AppData,
> extends EnhancedEventEmitter<ProducerEvents> {
	// Internal data.
	readonly #internal: ProducerInternal;

	// Producer data.
	readonly #data: ProducerData;

	// Channel instance.
	readonly #channel: Channel;

	// Closed flag.
	#closed = false;

	// Paused flag.
	#paused = false;

	// Custom app data.
	#appData: ProducerAppData;

	// Current score.
	#score: ProducerScore[] = [];

	// Observer instance.
	readonly #observer = new EnhancedEventEmitter<ProducerObserverEvents>();

	/**
	 * @private
	 */
	constructor({
		internal,
		data,
		channel,
		appData,
		paused,
	}: {
		internal: ProducerInternal;
		data: ProducerData;
		channel: Channel;
		appData?: ProducerAppData;
		paused: boolean;
	}) {
		super();

		logger.debug('constructor()');

		this.#internal = internal;
		this.#data = data;
		this.#channel = channel;
		this.#paused = paused;
		this.#appData = appData || ({} as ProducerAppData);

		this.handleWorkerNotifications();
	}

	/**
	 * Producer id.
	 */
	get id(): string {
		return this.#internal.producerId;
	}

	/**
	 * Whether the Producer is closed.
	 */
	get closed(): boolean {
		return this.#closed;
	}

	/**
	 * Media kind.
	 */
	get kind(): MediaKind {
		return this.#data.kind;
	}

	/**
	 * RTP parameters.
	 */
	get rtpParameters(): RtpParameters {
		return this.#data.rtpParameters;
	}

	/**
	 * Producer type.
	 */
	get type(): ProducerType {
		return this.#data.type;
	}

	/**
	 * Consumable RTP parameters.
	 *
	 * @private
	 */
	get consumableRtpParameters(): RtpParameters {
		return this.#data.consumableRtpParameters;
	}

	/**
	 * Whether the Producer is paused.
	 */
	get paused(): boolean {
		return this.#paused;
	}

	/**
	 * Producer score list.
	 */
	get score(): ProducerScore[] {
		return this.#score;
	}

	/**
	 * App custom data.
	 */
	get appData(): ProducerAppData {
		return this.#appData;
	}

	/**
	 * App custom data setter.
	 */
	set appData(appData: ProducerAppData) {
		this.#appData = appData;
	}

	/**
	 * Observer.
	 */
	get observer(): EnhancedEventEmitter<ProducerObserverEvents> {
		return this.#observer;
	}

	/**
	 * @private
	 * Just for testing purposes.
	 */
	get channelForTesting(): Channel {
		return this.#channel;
	}

	/**
	 * Close the Producer.
	 */
	close(): void {
		if (this.#closed) {
			return;
		}

		logger.debug('close()');

		this.#closed = true;

		// Remove notification subscriptions.
		this.#channel.removeAllListeners(this.#internal.producerId);

		/* Build Request. */
		const requestOffset = new FbsTransport.CloseProducerRequestT(
			this.#internal.producerId
		).pack(this.#channel.bufferBuilder);

		this.#channel
			.request(
				FbsRequest.Method.TRANSPORT_CLOSE_PRODUCER,
				FbsRequest.Body.Transport_CloseProducerRequest,
				requestOffset,
				this.#internal.transportId
			)
			.catch(() => {});

		this.emit('@close');

		// Emit observer event.
		this.#observer.safeEmit('close');
	}

	/**
	 * Transport was closed.
	 *
	 * @private
	 */
	transportClosed(): void {
		if (this.#closed) {
			return;
		}

		logger.debug('transportClosed()');

		this.#closed = true;

		// Remove notification subscriptions.
		this.#channel.removeAllListeners(this.#internal.producerId);

		this.safeEmit('transportclose');

		// Emit observer event.
		this.#observer.safeEmit('close');
	}

	/**
	 * Dump Producer.
	 */
	async dump(): Promise<ProducerDump> {
		logger.debug('dump()');

		const response = await this.#channel.request(
			FbsRequest.Method.PRODUCER_DUMP,
			undefined,
			undefined,
			this.#internal.producerId
		);

		/* Decode Response. */
		const dumpResponse = new FbsProducer.DumpResponse();

		response.body(dumpResponse);

		return parseProducerDump(dumpResponse);
	}

	/**
	 * Get Producer stats.
	 */
	async getStats(): Promise<ProducerStat[]> {
		logger.debug('getStats()');

		const response = await this.#channel.request(
			FbsRequest.Method.PRODUCER_GET_STATS,
			undefined,
			undefined,
			this.#internal.producerId
		);

		/* Decode Response. */
		const data = new FbsProducer.GetStatsResponse();

		response.body(data);

		return parseProducerStats(data);
	}

	/**
	 * Pause the Producer.
	 */
	async pause(): Promise<void> {
		logger.debug('pause()');

		await this.#channel.request(
			FbsRequest.Method.PRODUCER_PAUSE,
			undefined,
			undefined,
			this.#internal.producerId
		);

		const wasPaused = this.#paused;

		this.#paused = true;

		// Emit observer event.
		if (!wasPaused) {
			this.#observer.safeEmit('pause');
		}
	}

	/**
	 * Resume the Producer.
	 */
	async resume(): Promise<void> {
		logger.debug('resume()');

		await this.#channel.request(
			FbsRequest.Method.PRODUCER_RESUME,
			undefined,
			undefined,
			this.#internal.producerId
		);

		const wasPaused = this.#paused;

		this.#paused = false;

		// Emit observer event.
		if (wasPaused) {
			this.#observer.safeEmit('resume');
		}
	}

	/**
	 * Enable 'trace' event.
	 */
	async enableTraceEvent(types: ProducerTraceEventType[] = []): Promise<void> {
		logger.debug('enableTraceEvent()');

		if (!Array.isArray(types)) {
			throw new TypeError('types must be an array');
		}
		if (types.find(type => typeof type !== 'string')) {
			throw new TypeError('every type must be a string');
		}

		// Convert event types.
		const fbsEventTypes: FbsProducer.TraceEventType[] = [];

		for (const eventType of types) {
			try {
				fbsEventTypes.push(producerTraceEventTypeToFbs(eventType));
			} catch (error) {
				logger.warn('enableTraceEvent() | [error:${error}]');
			}
		}

		/* Build Request. */
		const requestOffset = new FbsProducer.EnableTraceEventRequestT(
			fbsEventTypes
		).pack(this.#channel.bufferBuilder);

		await this.#channel.request(
			FbsRequest.Method.PRODUCER_ENABLE_TRACE_EVENT,
			FbsRequest.Body.Producer_EnableTraceEventRequest,
			requestOffset,
			this.#internal.producerId
		);
	}

	/**
	 * Send RTP packet (just valid for Producers created on a DirectTransport).
	 */
	send(rtpPacket: Buffer) {
		if (!Buffer.isBuffer(rtpPacket)) {
			throw new TypeError('rtpPacket must be a Buffer');
		}

		const builder = this.#channel.bufferBuilder;
		const dataOffset = FbsProducer.SendNotification.createDataVector(
			builder,
			rtpPacket
		);
		const notificationOffset =
			FbsProducer.SendNotification.createSendNotification(builder, dataOffset);

		this.#channel.notify(
			FbsNotification.Event.PRODUCER_SEND,
			FbsNotification.Body.Producer_SendNotification,
			notificationOffset,
			this.#internal.producerId
		);
	}

	private handleWorkerNotifications(): void {
		this.#channel.on(
			this.#internal.producerId,
			(event: Event, data?: Notification) => {
				switch (event) {
					case Event.PRODUCER_SCORE: {
						const notification = new FbsProducer.ScoreNotification();

						data!.body(notification);

						const score: ProducerScore[] = utils.parseVector(
							notification,
							'scores',
							parseProducerScore
						);

						this.#score = score;

						this.safeEmit('score', score);

						// Emit observer event.
						this.#observer.safeEmit('score', score);

						break;
					}

					case Event.PRODUCER_VIDEO_ORIENTATION_CHANGE: {
						const notification =
							new FbsProducer.VideoOrientationChangeNotification();

						data!.body(notification);

						const videoOrientation: ProducerVideoOrientation =
							notification.unpack();

						this.safeEmit('videoorientationchange', videoOrientation);

						// Emit observer event.
						this.#observer.safeEmit('videoorientationchange', videoOrientation);

						break;
					}

					case Event.PRODUCER_TRACE: {
						const notification = new FbsProducer.TraceNotification();

						data!.body(notification);

						const trace: ProducerTraceEventData =
							parseTraceEventData(notification);

						this.safeEmit('trace', trace);

						// Emit observer event.
						this.#observer.safeEmit('trace', trace);

						break;
					}

					default: {
						logger.error('ignoring unknown event "%s"', event);
					}
				}
			}
		);
	}
}

export function producerTypeFromFbs(type: FbsRtpParameters.Type): ProducerType {
	switch (type) {
		case FbsRtpParameters.Type.SIMPLE: {
			return 'simple';
		}

		case FbsRtpParameters.Type.SIMULCAST: {
			return 'simulcast';
		}

		case FbsRtpParameters.Type.SVC: {
			return 'svc';
		}

		default: {
			throw new TypeError(`invalid FbsRtpParameters.Type: ${type}`);
		}
	}
}

export function producerTypeToFbs(type: ProducerType): FbsRtpParameters.Type {
	switch (type) {
		case 'simple': {
			return FbsRtpParameters.Type.SIMPLE;
		}

		case 'simulcast': {
			return FbsRtpParameters.Type.SIMULCAST;
		}

		case 'svc': {
			return FbsRtpParameters.Type.SVC;
		}
	}
}

function producerTraceEventTypeToFbs(
	eventType: ProducerTraceEventType
): FbsProducer.TraceEventType {
	switch (eventType) {
		case 'keyframe': {
			return FbsProducer.TraceEventType.KEYFRAME;
		}

		case 'fir': {
			return FbsProducer.TraceEventType.FIR;
		}

		case 'nack': {
			return FbsProducer.TraceEventType.NACK;
		}

		case 'pli': {
			return FbsProducer.TraceEventType.PLI;
		}

		case 'rtp': {
			return FbsProducer.TraceEventType.RTP;
		}

		case 'sr': {
			return FbsProducer.TraceEventType.SR;
		}

		default: {
			throw new TypeError(`invalid ProducerTraceEventType: ${eventType}`);
		}
	}
}

function producerTraceEventTypeFromFbs(
	eventType: FbsProducer.TraceEventType
): ProducerTraceEventType {
	switch (eventType) {
		case FbsProducer.TraceEventType.KEYFRAME: {
			return 'keyframe';
		}

		case FbsProducer.TraceEventType.FIR: {
			return 'fir';
		}

		case FbsProducer.TraceEventType.NACK: {
			return 'nack';
		}

		case FbsProducer.TraceEventType.PLI: {
			return 'pli';
		}

		case FbsProducer.TraceEventType.RTP: {
			return 'rtp';
		}

		case FbsProducer.TraceEventType.SR: {
			return 'sr';
		}
	}
}

export function parseProducerDump(
	data: FbsProducer.DumpResponse
): ProducerDump {
	return {
		id: data.id()!,
		kind: data.kind() === FbsRtpParameters.MediaKind.AUDIO ? 'audio' : 'video',
		type: producerTypeFromFbs(data.type()),
		rtpParameters: parseRtpParameters(data.rtpParameters()!),
		// NOTE: optional values are represented with null instead of undefined.
		// TODO: Make flatbuffers TS return undefined instead of null.
		rtpMapping: data.rtpMapping() ? data.rtpMapping()!.unpack() : undefined,
		// NOTE: optional values are represented with null instead of undefined.
		// TODO: Make flatbuffers TS return undefined instead of null.
		rtpStreams:
			data.rtpStreamsLength() > 0
				? utils.parseVector(data, 'rtpStreams', (rtpStream: any) =>
						rtpStream.unpack()
					)
				: undefined,
		traceEventTypes: utils.parseVector<ProducerTraceEventType>(
			data,
			'traceEventTypes',
			producerTraceEventTypeFromFbs
		),
		paused: data.paused(),
	};
}

function parseProducerStats(
	binary: FbsProducer.GetStatsResponse
): ProducerStat[] {
	return utils.parseVector(binary, 'stats', parseRtpStreamRecvStats);
}

function parseProducerScore(binary: FbsProducer.Score): ProducerScore {
	return {
		encodingIdx: binary.encodingIdx(),
		ssrc: binary.ssrc(),
		rid: binary.rid() ?? undefined,
		score: binary.score(),
	};
}

function parseTraceEventData(
	trace: FbsProducer.TraceNotification
): ProducerTraceEventData {
	let info: any;

	if (trace.infoType() !== FbsProducer.TraceInfo.NONE) {
		const accessor = trace.info.bind(trace);

		info = FbsProducerTraceInfo.unionToTraceInfo(trace.infoType(), accessor);

		trace.info(info);
	}

	return {
		type: producerTraceEventTypeFromFbs(trace.type()),
		timestamp: Number(trace.timestamp()),
		direction:
			trace.direction() === FbsTraceDirection.DIRECTION_IN ? 'in' : 'out',
		info: info ? info.unpack() : undefined,
	};
}
