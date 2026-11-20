declare module 'mineflayer' {
  export interface Bot {
    [key: string]: any;
  }
  const mineflayer: {
    createBot: (options: any) => Bot;
    [key: string]: any;
  };
  export default mineflayer;
}

declare module 'prismarine-nbt' {
  const nbt: any;
  export default nbt;
}
