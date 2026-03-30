export type Game = {
  id: string;
  name: string;
  packageName?: string;
  iconText?: string;
  iconUri?: string;
  subtitle?: string;
};

export const fallbackGames: Game[] = [
  {id: 'g1', name: 'Call of Duty: Mobile', subtitle: 'FPS', iconText: 'CODM'},
  {id: 'g2', name: 'EA SPORTS FC Mobile', subtitle: 'Sports', iconText: 'FCM'},
  {id: 'g3', name: 'Warhammer: Soul Arena', subtitle: 'RPG', iconText: 'WSA'},
  {id: 'g4', name: 'PPSSPP', subtitle: 'Emulator', iconText: 'PSP'},
  {id: 'g5', name: 'Discord', subtitle: 'Chat', iconText: 'DC'},
];
