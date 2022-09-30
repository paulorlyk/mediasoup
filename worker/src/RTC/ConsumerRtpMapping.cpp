#define MS_CLASS "RTC::SimpleConsumer"
// #define MS_LOG_DEV_LEVEL 3

#include "RTC/ConsumerRtpMapping.hpp"
#include "Logger.hpp"
#include "MediaSoupErrors.hpp"

namespace RTC
{
	/* Instance methods. */

	ConsumerRtpMapping::ConsumerRtpMapping(json& data)
	{
		MS_TRACE();

		auto jsonRtpMappingIt = data.find("consumerRtpMapping");

		if (jsonRtpMappingIt != data.end())
		{
			if (!jsonRtpMappingIt->is_object())
				MS_THROW_TYPE_ERROR("wrong consumerRtpMapping (not an object)");

			auto jsonCodecsIt = jsonRtpMappingIt->find("codecs");

			if (jsonCodecsIt == jsonRtpMappingIt->end() || !jsonCodecsIt->is_array())
			{
				MS_THROW_TYPE_ERROR("missing consumerRtpMapping.codecs");
			}

			for (auto& codec : *jsonCodecsIt)
			{
				if (!codec.is_object())
				{
					MS_THROW_TYPE_ERROR("wrong entry in consumerRtpMapping.codecs (not an object)");
				}

				auto jsonPayloadTypeIt = codec.find("payloadType");

				// clang-format off
                if (
                    jsonPayloadTypeIt == codec.end() ||
                        !Utils::Json::IsPositiveInteger(*jsonPayloadTypeIt)
                    )
				// clang-format on
				{
					MS_THROW_TYPE_ERROR("wrong entry in consumerRtpMapping.codecs (missing payloadType)");
				}

				auto jsonMappedPayloadTypeIt = codec.find("mappedPayloadType");

				// clang-format off
                if (
                    jsonMappedPayloadTypeIt == codec.end() ||
                        !Utils::Json::IsPositiveInteger(*jsonMappedPayloadTypeIt)
                    )
				// clang-format on
				{
					MS_THROW_TYPE_ERROR("wrong entry in consumerRtpMapping.codecs (missing mappedPayloadType)");
				}

				MS_DEBUG_TAG(
				  rtp,
				  "RTP payload type mapping received: %d -> %d",
				  jsonPayloadTypeIt->get<uint8_t>(),
				  jsonMappedPayloadTypeIt->get<uint8_t>());

				this->codecs[jsonPayloadTypeIt->get<uint8_t>()] = jsonMappedPayloadTypeIt->get<uint8_t>();
			}

			auto jsonHeaderExtensionsIt = jsonRtpMappingIt->find("headerExtensions");

			if (jsonHeaderExtensionsIt == jsonRtpMappingIt->end() || !jsonHeaderExtensionsIt->is_array())
			{
				MS_THROW_TYPE_ERROR("missing consumerRtpMapping.jsonHeaderExtensionsIt");
			}

			for (auto& headerExtension : *jsonHeaderExtensionsIt)
			{
				if (!headerExtension.is_object())
				{
					MS_THROW_TYPE_ERROR("wrong entry in consumerRtpMapping.headerExtensions (not an object)");
				}

				auto jsonIdIt = headerExtension.find("id");

				// clang-format off
                if (
                    jsonIdIt == headerExtension.end() ||
                        !Utils::Json::IsPositiveInteger(*jsonIdIt)
                    )
				// clang-format on
				{
					MS_THROW_TYPE_ERROR("wrong entry in consumerRtpMapping.headerExtensions (missing id)");
				}

				auto jsonMappedIdIt = headerExtension.find("mappedId");

				// clang-format off
                if (
                    jsonMappedIdIt == headerExtension.end() ||
                        !Utils::Json::IsPositiveInteger(*jsonMappedIdIt)
                    )
				// clang-format on
				{
					MS_THROW_TYPE_ERROR("wrong entry in consumerRtpMapping.headerExtensions (missing mappedId)");
				}

				MS_DEBUG_TAG(
				  rtp,
				  "Header extension mapping received: %d -> %d",
				  jsonIdIt->get<uint8_t>(),
				  jsonMappedIdIt->get<uint8_t>());

				this->headerExtensions[jsonIdIt->get<uint8_t>()] = jsonMappedIdIt->get<uint8_t>();
			}
		}
	}

	ConsumerRtpMapping::~ConsumerRtpMapping()
	{
		MS_TRACE();
	}

	void ConsumerRtpMapping::FillJson(json& jsonObject) const
	{
		MS_TRACE();

		// Add consumerRtpMapping.
		jsonObject["consumerRtpMapping"] = json::object();
		auto jsonRtpMappingIt            = jsonObject.find("consumerRtpMapping");

		// Add consumerRtpMapping.codecs.
		{
			(*jsonRtpMappingIt)["codecs"] = json::array();
			auto jsonCodecsIt             = jsonRtpMappingIt->find("codecs");
			size_t idx{ 0 };

			for (const auto& kv : this->codecs)
			{
				jsonCodecsIt->emplace_back(json::value_t::object);

				auto& jsonEntry        = (*jsonCodecsIt)[idx];
				auto payloadType       = kv.first;
				auto mappedPayloadType = kv.second;

				jsonEntry["payloadType"]       = payloadType;
				jsonEntry["mappedPayloadType"] = mappedPayloadType;

				++idx;
			}
		}

		// Add consumerRtpMapping.headerExtensions.
		{
			(*jsonRtpMappingIt)["headerExtensions"] = json::array();
			auto jsonCodecsIt                       = jsonRtpMappingIt->find("headerExtensions");
			size_t idx{ 0 };

			for (const auto& kv : this->headerExtensions)
			{
				jsonCodecsIt->emplace_back(json::value_t::object);

				auto& jsonEntry = (*jsonCodecsIt)[idx];
				auto id         = kv.first;
				auto mappedId   = kv.second;

				jsonEntry["id"]       = id;
				jsonEntry["mappedId"] = mappedId;

				++idx;
			}
		}
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
