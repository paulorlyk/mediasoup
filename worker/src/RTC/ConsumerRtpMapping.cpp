#define MS_CLASS "RTC::ConsumerRtpMapping"
// #define MS_LOG_DEV_LEVEL 3

#include "RTC/ConsumerRtpMapping.hpp"
#include "Logger.hpp"
#include "MediaSoupErrors.hpp"

namespace RTC
{
	/* Instance methods. */

	ConsumerRtpMapping::ConsumerRtpMapping(const FBS::Transport::ConsumeRequest* data)
	{
		MS_TRACE();

		const FBS::Consumer::ConsumerRtpMapping *consumerRtpMapping = data->consumerRtpMapping();
		if(consumerRtpMapping)
		{
			for (const auto* codec : *consumerRtpMapping->codecs())
			{
				const uint8_t payloadType = codec->payloadType();
				const uint8_t mappedPayloadType = codec->mappedPayloadType();
  
				MS_DEBUG_TAG(rtp, "RTP payload type mapping received: %d -> %d", payloadType, mappedPayloadType);
  
				this->codecs[payloadType] = mappedPayloadType;
			}
  
			for (const auto* headerExtension : *consumerRtpMapping->headerExtensions())
			{
				const uint8_t id = headerExtension->id();
				const uint8_t mappedId = headerExtension->mappedId();
  
				MS_DEBUG_TAG(rtp, "Header extension mapping received: %d -> %d", id, mappedId);
  
				this->headerExtensions[id] = mappedId;
			}
		}
	}

	ConsumerRtpMapping::~ConsumerRtpMapping()
	{
		MS_TRACE();
	}

	void ConsumerRtpMapping::MapRTPHeaderExtensions(RTC::RtpPacket* packet, bool reverse) const
	{
		// Map Header extensions by swapping them around
		// Algorithm:
		// 1. Build arrays of source (vIdA) and destination (vIdB) indexes
		// 2. For each element of vIdA:
		//      a. swap [vIdA] <-> [vIdB]
		//      b. in remaining vIdA, replace index equal to current destination to current source

		if (this->headerExtensions.empty())
			return;

		const int maxMoves = 128;

		uint8_t vIdA[maxMoves] = {};
		uint8_t vIdB[maxMoves] = {};
		int nMoves             = 0;
		for (const auto kv : this->headerExtensions)
		{
			vIdA[nMoves] = reverse ? kv.second : kv.first;
			vIdB[nMoves] = reverse ? kv.first : kv.second;
			++nMoves;

			if (nMoves >= maxMoves)
			{
				MS_WARN_TAG(rtp, "RTP header extension map is too big - truncating to %d elements", maxMoves);
				break;
			}
		}

		for (int i = 0; i < nMoves; ++i)
		{
			packet->SwapExtensions(vIdA[i], vIdB[i]);

			for (int j = i; j < nMoves; ++j)
			{
				if (vIdA[j] == vIdB[i])
				{
					vIdA[j] = vIdA[i];
					break;
				}
			}
		}
	}
} // namespace RTC
