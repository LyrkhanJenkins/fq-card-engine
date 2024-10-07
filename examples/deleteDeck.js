socket = socketlib.registerModule(FqCardEngineModule.moduleName);
await socket.executeAsGM('deleteDeckForUser', game.userId);
