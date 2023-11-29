#ifndef MS_RTC_CONSUMER_RTP_MAPPING_HPP
#define MS_RTC_CONSUMER_RTP_MAPPING_HPP

#include "RTC/RtpPacket.hpp"
#include "FBS/transport.h"

namespace RTC
{
	class ConsumerRtpMapping
	{
	public:
		ConsumerRtpMapping(const FBS::Transport::ConsumeRequest* data);
		~ConsumerRtpMapping();

	public:
		void MapRTPHeaderExtensions(RTC::RtpPacket* packet, bool reverse) const;

		uint8_t MapPayloadType(uint8_t payloadType)
		{
			auto it = this->codecs.find(payloadType);
			if (it == this->codecs.end())
				return payloadType;

			return it->second;
		}

	private:
		absl::flat_hash_map<uint8_t, uint8_t> codecs;
		absl::flat_hash_map<uint8_t, uint8_t> headerExtensions;
	};
} // namespace RTC

#endif
