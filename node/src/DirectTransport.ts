import { Logger } from './Logger';
import { UnsupportedError } from './errors';
import {
	BaseTransportDump,
	BaseTransportStats,
	parseBaseTransportDump,
	parseBaseTransportStats,
	parseTransportTraceEventData,
	Transport,
	TransportEvents,
	TransportObserverEvents,
	TransportConstructorOptions,
} from './Transport';
import { SctpParameters } from './SctpParameters';
import { AppData } from './types';
import { Event, Notification } from './fbs/notification';
import * as FbsDirectTransport from './fbs/direct-transport';
import * as FbsTransport from './fbs/transport';
import * as FbsNotification from './fbs/notification';
import * as FbsRequest from './fbs/request';

export type DirectTransportOptions<
	DirectTransportAppData extends AppData = AppData,
> = {
	/**
	 * Maximum allowed size for direct messages sent from DataProducers.
	 * Default 262144.
	 */
	maxMessageSize: number;

	/**
	 * Custom application data.
	 */
	appData?: DirectTransportAppData;
};

export type DirectTransportDump = BaseTransportDump;

export type DirectTransportStat = BaseTransportStats & {
	type: string;
};

export type DirectTransportEvents = TransportEvents & {
	rtcp: [Buffer];
};

export type DirectTransportObserverEvents = TransportObserverEvents & {
	rtcp: [Buffer];
};

type DirectTransportConstructorOptions<DirectTransportAppData> =
	TransportConstructorOptions<DirectTransportAppData> & {
		data: DirectTransportData;
	};

export type DirectTransportData = {
	sctpParameters?: SctpParameters;
};

const logger = new Logger('DirectTransport');

export class DirectTransport<
	DirectTransportAppData extends AppData = AppData,
> extends Transport<
	DirectTransportAppData,
	DirectTransportEvents,
	DirectTransportObserverEvents
> {
	// DirectTransport data.
	readonly #data: DirectTransportData;

	/**
	 * @private
	 */
	constructor(
		options: DirectTransportConstructorOptions<DirectTransportAppData>
	) {
		super(options);

		logger.debug('constructor()');

		this.#data = {
			// Nothing.
		};

		this.handleWorkerNotifications();
	}

	/**
	 * Close the DirectTransport.
	 *
	 * @override
	 */
	close(): void {
		if (this.closed) {
			return;
		}

		super.close();
	}

	/**
	 * Router was closed.
	 *
	 * @private
	 * @override
	 */
	routerClosed(): void {
		if (this.closed) {
			return;
		}

		super.routerClosed();
	}

	/**
	 * Dump Transport.
	 */
	async dump(): Promise<DirectTransportDump> {
		logger.debug('dump()');

		const response = await this.channel.request(
			FbsRequest.Method.TRANSPORT_DUMP,
			undefined,
			undefined,
			this.internal.transportId
		);

		/* Decode Response. */
		const data = new FbsDirectTransport.DumpResponse();

		response.body(data);

		return parseDirectTransportDumpResponse(data);
	}

	/**
	 * Get DirectTransport stats.
	 *
	 * @override
	 */
	async getStats(): Promise<DirectTransportStat[]> {
		logger.debug('getStats()');

		const response = await this.channel.request(
			FbsRequest.Method.TRANSPORT_GET_STATS,
			undefined,
			undefined,
			this.internal.transportId
		);

		/* Decode Response. */
		const data = new FbsDirectTransport.GetStatsResponse();

		response.body(data);

		return [parseGetStatsResponse(data)];
	}

	/**
	 * NO-OP method in DirectTransport.
	 *
	 * @override
	 */
	async connect(): Promise<void> {
		logger.debug('connect()');
	}

	/**
	 * @override
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setMaxIncomingBitrate(bitrate: number): Promise<void> {
		throw new UnsupportedError(
			'setMaxIncomingBitrate() not implemented in DirectTransport'
		);
	}

	/**
	 * @override
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setMaxOutgoingBitrate(bitrate: number): Promise<void> {
		throw new UnsupportedError(
			'setMaxOutgoingBitrate() not implemented in DirectTransport'
		);
	}

	/**
	 * @override
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setMinOutgoingBitrate(bitrate: number): Promise<void> {
		throw new UnsupportedError(
			'setMinOutgoingBitrate() not implemented in DirectTransport'
		);
	}

	/**
	 * Send RTCP packet.
	 */
	sendRtcp(rtcpPacket: Buffer) {
		if (!Buffer.isBuffer(rtcpPacket)) {
			throw new TypeError('rtcpPacket must be a Buffer');
		}

		const builder = this.channel.bufferBuilder;
		const dataOffset = FbsTransport.SendRtcpNotification.createDataVector(
			builder,
			rtcpPacket
		);
		const notificationOffset =
			FbsTransport.SendRtcpNotification.createSendRtcpNotification(
				builder,
				dataOffset
			);

		this.channel.notify(
			FbsNotification.Event.TRANSPORT_SEND_RTCP,
			FbsNotification.Body.Transport_SendRtcpNotification,
			notificationOffset,
			this.internal.transportId
		);
	}

	private handleWorkerNotifications(): void {
		this.channel.on(
			this.internal.transportId,
			(event: Event, data?: Notification) => {
				switch (event) {
					case Event.TRANSPORT_TRACE: {
						const notification = new FbsTransport.TraceNotification();

						data!.body(notification);

						const trace = parseTransportTraceEventData(notification);

						this.safeEmit('trace', trace);

						// Emit observer event.
						this.observer.safeEmit('trace', trace);

						break;
					}

					case Event.DIRECTTRANSPORT_RTCP: {
						if (this.closed) {
							break;
						}

						const notification = new FbsDirectTransport.RtcpNotification();

						data!.body(notification);

						this.safeEmit('rtcp', Buffer.from(notification.dataArray()!));

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

export function parseDirectTransportDumpResponse(
	binary: FbsDirectTransport.DumpResponse
): BaseTransportDump {
	return parseBaseTransportDump(binary.base()!);
}

function parseGetStatsResponse(
	binary: FbsDirectTransport.GetStatsResponse
): DirectTransportStat {
	const base = parseBaseTransportStats(binary.base()!);

	return {
		...base,
		type: 'direct-transport',
	};
}
