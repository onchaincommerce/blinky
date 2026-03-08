import { AccessToken } from "livekit-server-sdk";

import { config } from "../config.js";

export class LiveKitService {
  async createParticipantToken(roomName: string, participantId: string, displayName: string) {
    if (!config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET || !config.LIVEKIT_WS_URL) {
      return null;
    }

    const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity: participantId,
      name: displayName
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true
    });

    return {
      roomName,
      wsUrl: config.LIVEKIT_WS_URL,
      token: await token.toJwt()
    };
  }
}
