import type { Game } from "./games";

export type GameTargetHost = {
  host: string;
  port: number;
  weight?: number;
};

export type GameTargetProfile = {
  id: string;
  label: string;
  targets: GameTargetHost[];
};

const GAME_TARGET_PROFILES: Array<{
  match: (game: Game | null) => boolean;
  profile: GameTargetProfile;
}> = [
  {
    match: (game) =>
      !!game?.packageName &&
      /com\.ea\.gp\.fifamobile|fcmobile|fifa/i.test(game.packageName),
    profile: {
      id: "ea-fc",
      label: "EA FC Mobile",
      targets: [
        { host: "accounts.ea.com", port: 443, weight: 1.2 },
        { host: "www.ea.com", port: 443, weight: 1.0 }
      ]
    }
  },
  {
    match: (game) =>
      !!game?.packageName &&
      /activision|callofduty|codm/i.test(game.packageName),
    profile: {
      id: "codm",
      label: "Call of Duty Mobile",
      targets: [
        { host: "www.callofduty.com", port: 443, weight: 1.15 },
        { host: "profile.callofduty.com", port: 443, weight: 1.0 }
      ]
    }
  },
  {
    match: (game) =>
      !!game?.packageName &&
      /discord/i.test(game.packageName),
    profile: {
      id: "discord",
      label: "Discord",
      targets: [
        { host: "gateway.discord.gg", port: 443, weight: 1.3 },
        { host: "discord.com", port: 443, weight: 1.0 }
      ]
    }
  },
  {
    match: (game) =>
      !!game?.packageName &&
      /ppsspp/i.test(game.packageName),
    profile: {
      id: "ppsspp",
      label: "PPSSPP",
      targets: [{ host: "www.ppsspp.org", port: 443, weight: 1.0 }]
    }
  }
];

export const getGameTargetProfile = (game: Game | null): GameTargetProfile | null => {
  if (!game) return null;
  const match = GAME_TARGET_PROFILES.find((item) => item.match(game));
  return match?.profile ?? null;
};
